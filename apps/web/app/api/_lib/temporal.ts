import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import type {
  CommentWorkflowActivities,
  CommentWorkflowInput
} from "../../../../worker/src/workflows/commentWorkflow";
import { getOrchestrationRuntimeDetails } from "./orchestrationRuntime";

const inlineInFlightByWorkflowId = new Map<string, Promise<void>>();
let hasLoggedOrchestrationMode = false;

function logOrchestrationModeOnce() {
  if (hasLoggedOrchestrationMode) return;
  hasLoggedOrchestrationMode = true;

  if (process.env.NODE_ENV === "test") return;

  const details = getOrchestrationRuntimeDetails();
  if (details.isInvalidValue && details.rawMode) {
    console.warn(
      `[orchestration] unrecognized COMMENT_ORCHESTRATION_MODE=${details.rawMode}; falling back to temporal`
    );
  }

  console.info(
    `[orchestration] comment workflow mode=${details.mode} source=${details.source} raw=${
      details.rawMode || "(unset)"
    }`
  );
}

async function runInlineCommentWorkflow(input: CommentWorkflowInput) {
  const [workflowModule, activitiesModule] = await Promise.all([
    import("../../../../worker/src/workflows/commentWorkflow"),
    import("../../../../worker/src/activities")
  ]);

  const activities: CommentWorkflowActivities = {
    logStage: activitiesModule.logStage,
    buildContext: activitiesModule.buildContext,
    interpretIntent: activitiesModule.interpretIntent,
    generateDraft: activitiesModule.generateDraft,
    runSafetyGate: activitiesModule.runSafetyGate,
    routeAndPersist: activitiesModule.routeAndPersist
  };

  await workflowModule.runCommentWorkflow(input, activities);
}

async function startInlineCommentWorkflow(input: CommentWorkflowInput) {
  const workflowId = `comment-${input.commentId}`;
  if (inlineInFlightByWorkflowId.has(workflowId)) {
    return { workflowId, started: false as const, alreadyStarted: true as const };
  }

  const runPromise = runInlineCommentWorkflow(input)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[orchestration] inline workflow ${workflowId} failed after webhook accept: ${message}`
      );
    })
    .finally(() => {
      inlineInFlightByWorkflowId.delete(workflowId);
    });
  inlineInFlightByWorkflowId.set(workflowId, runPromise);

  return { workflowId, started: true as const, alreadyStarted: false as const };
}

async function startTemporalCommentWorkflow(input: CommentWorkflowInput) {
  const workflowId = `comment-${input.commentId}`;
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
  });

  const client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default"
  });

  try {
    await client.workflow.start("commentWorkflow", {
      args: [input],
      taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "comment-copilot",
      workflowId
    });
    return { workflowId, started: true as const, alreadyStarted: false as const };
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      return { workflowId, started: false as const, alreadyStarted: true as const };
    }
    throw error;
  }
}

export async function startCommentWorkflow(args: {
  accountId: string;
  commentId: string;
}) {
  const mode = getOrchestrationRuntimeDetails().mode;
  logOrchestrationModeOnce();

  if (mode === "inline") {
    return startInlineCommentWorkflow(args);
  }

  return startTemporalCommentWorkflow(args);
}
