import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import type { CommentWorkflowInput } from "./workflows/commentWorkflow";
import { commentWorkflow } from "./workflows/commentWorkflow";

export async function startCommentWorkflow(input: CommentWorkflowInput) {
  const workflowId = `comment-${input.commentId}`;
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
  });

  const client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default"
  });

  try {
    await client.workflow.start(commentWorkflow, {
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
