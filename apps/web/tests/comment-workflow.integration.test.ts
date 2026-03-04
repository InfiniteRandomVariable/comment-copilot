import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";
import {
  runCommentWorkflow,
  type CommentWorkflowActivities
} from "../../worker/src/workflows/commentWorkflow";

const workflowInput = {
  accountId: "acc_1",
  commentId: "com_1"
};

const contextResult = {
  accountId: "acc_1",
  commentId: "com_1",
  messageId: "msg_1",
  commentText: "hello",
  sourceVideoTitle: "video",
  creatorThemeSummary: "theme",
  commenterProfileSummary: null,
  commenterLatestVideoSummary: null,
  responseStyleSkillVersionId: null,
  customResponseStyleSkillVersionId: null,
  responseStyleMarkdown: "style",
  customStyleMarkdown: "custom",
  contextCompleteness: "complete" as const,
  missingContextFields: [],
  contextSnapshotJson: "{\"k\":\"v\"}"
};

const intentResult = {
  intentLabel: "question" as const,
  intentConfidence: 0.8,
  engagementGoal: "answer",
  safetyFlags: []
};

const generationResult = {
  draftText: "Thanks for asking!",
  confidenceScore: 0.9,
  rationale: "safe",
  personalizationSignals: ["signal_1"],
  generationTelemetry: {
    providerAttempts: 1,
    providerRetries: 0,
    providerStatusCode: 200,
    providerUsedRetryAfter: false,
    model: "model_x"
  }
};

const safetyResult = {
  riskScore: 0.1,
  riskLevel: "low" as const,
  safetyFlags: [],
  rationale: "safe",
  moderationTelemetry: {
    providerAttempts: 1,
    providerRetries: 0,
    providerStatusCode: 200,
    providerUsedRetryAfter: false,
    model: "model_y"
  }
};

const routeResult = {
  route: "pending_review" as const,
  candidateId: "cand_1",
  approvalTaskId: "task_1"
};

const activities: CommentWorkflowActivities = {
  logStage: vi.fn(),
  buildContext: vi.fn(),
  interpretIntent: vi.fn(),
  generateDraft: vi.fn(),
  runSafetyGate: vi.fn(),
  routeAndPersist: vi.fn()
};

function getLoggedStages(): Array<{ stage: string; runStatus: string }> {
  return (activities.logStage as any).mock.calls.map(
    (call: any[]) => call[0] as { stage: string; runStatus: string }
  );
}

describe("commentWorkflow stage logging", () => {
  beforeEach(() => {
    (activities.logStage as any).mockReset();
    (activities.buildContext as any).mockReset();
    (activities.interpretIntent as any).mockReset();
    (activities.generateDraft as any).mockReset();
    (activities.runSafetyGate as any).mockReset();
    (activities.routeAndPersist as any).mockReset();

    (activities.buildContext as any).mockResolvedValue(contextResult);
    (activities.interpretIntent as any).mockResolvedValue(intentResult);
    (activities.generateDraft as any).mockResolvedValue(generationResult);
    (activities.runSafetyGate as any).mockResolvedValue(safetyResult);
    (activities.routeAndPersist as any).mockResolvedValue(routeResult);
  });

  it("logs stage starts/completions for successful workflow execution", async () => {
    const result = await runCommentWorkflow(workflowInput, activities);

    assert.deepEqual(result, routeResult);
    assert.equal((activities.logStage as any).mock.calls.length, 9);
    assert.deepEqual(
      getLoggedStages().map((entry) => [entry.stage, entry.runStatus]),
      [
        ["context", "started"],
        ["context", "completed"],
        ["intent", "started"],
        ["intent", "completed"],
        ["generation", "started"],
        ["generation", "completed"],
        ["safety", "started"],
        ["safety", "completed"],
        ["routing", "completed"]
      ]
    );
  });

  it("logs generation failure and stops before safety/routing", async () => {
    (activities.generateDraft as any).mockRejectedValue(new Error("generation failure"));

    await assert.rejects(runCommentWorkflow(workflowInput, activities), /generation failure/);
    assert.equal((activities.runSafetyGate as any).mock.calls.length, 0);
    assert.equal((activities.routeAndPersist as any).mock.calls.length, 0);

    assert.deepEqual(
      getLoggedStages().map((entry) => [entry.stage, entry.runStatus]),
      [
        ["context", "started"],
        ["context", "completed"],
        ["intent", "started"],
        ["intent", "completed"],
        ["generation", "started"],
        ["generation", "failed"]
      ]
    );
  });

  it("logs safety failure and stops before routing", async () => {
    (activities.runSafetyGate as any).mockRejectedValue(new Error("safety failure"));

    await assert.rejects(runCommentWorkflow(workflowInput, activities), /safety failure/);
    assert.equal((activities.routeAndPersist as any).mock.calls.length, 0);

    assert.deepEqual(
      getLoggedStages().map((entry) => [entry.stage, entry.runStatus]),
      [
        ["context", "started"],
        ["context", "completed"],
        ["intent", "started"],
        ["intent", "completed"],
        ["generation", "started"],
        ["generation", "completed"],
        ["safety", "started"],
        ["safety", "failed"]
      ]
    );
  });
});
