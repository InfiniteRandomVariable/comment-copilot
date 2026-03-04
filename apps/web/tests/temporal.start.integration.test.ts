import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  class MockWorkflowExecutionAlreadyStartedError extends Error {}
  const startMock = vi.fn();
  const connectMock = vi.fn(async (_options?: unknown) => ({ mocked: true }));
  const runCommentWorkflowMock = vi.fn();
  const logStageMock = vi.fn();
  const buildContextMock = vi.fn();
  const interpretIntentMock = vi.fn();
  const generateDraftMock = vi.fn();
  const runSafetyGateMock = vi.fn();
  const routeAndPersistMock = vi.fn();
  const ClientMock = vi.fn(
    class {
      workflow: { start: (...args: unknown[]) => unknown };

      constructor(_options: unknown) {
        this.workflow = {
          start: (...args: unknown[]) => startMock(...args)
        };
      }
    }
  );

  return {
    MockWorkflowExecutionAlreadyStartedError,
    startMock,
    connectMock,
    ClientMock,
    runCommentWorkflowMock,
    logStageMock,
    buildContextMock,
    interpretIntentMock,
    generateDraftMock,
    runSafetyGateMock,
    routeAndPersistMock
  };
});

vi.mock("@temporalio/client", () => ({
  Connection: {
    connect: (options: unknown) => hoisted.connectMock(options)
  },
  Client: hoisted.ClientMock,
  WorkflowExecutionAlreadyStartedError: hoisted.MockWorkflowExecutionAlreadyStartedError
}));

vi.mock("../../worker/src/workflows/commentWorkflow", () => ({
  runCommentWorkflow: hoisted.runCommentWorkflowMock
}));

vi.mock("../../worker/src/activities", () => ({
  logStage: hoisted.logStageMock,
  buildContext: hoisted.buildContextMock,
  interpretIntent: hoisted.interpretIntentMock,
  generateDraft: hoisted.generateDraftMock,
  runSafetyGate: hoisted.runSafetyGateMock,
  routeAndPersist: hoisted.routeAndPersistMock
}));

import { startCommentWorkflow } from "../app/api/_lib/temporal";

async function waitForInlineDispatch(callCount: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (hoisted.runCommentWorkflowMock.mock.calls.length >= callCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("startCommentWorkflow", () => {
  beforeEach(() => {
    hoisted.startMock.mockReset();
    hoisted.connectMock.mockReset();
    hoisted.runCommentWorkflowMock.mockReset();
    hoisted.logStageMock.mockReset();
    hoisted.buildContextMock.mockReset();
    hoisted.interpretIntentMock.mockReset();
    hoisted.generateDraftMock.mockReset();
    hoisted.runSafetyGateMock.mockReset();
    hoisted.routeAndPersistMock.mockReset();
    delete process.env.COMMENT_ORCHESTRATION_MODE;
  });

  it("starts with deterministic workflow id", async () => {
    hoisted.startMock.mockResolvedValue({ runId: "run_1" });

    const result = await startCommentWorkflow({
      accountId: "acc_1",
      commentId: "com_1"
    });

    assert.deepEqual(result, {
      workflowId: "comment-com_1",
      started: true,
      alreadyStarted: false
    });

    assert.equal(hoisted.startMock.mock.calls.length, 1);
    const [, options] = hoisted.startMock.mock.calls[0]!;
    assert.equal((options as { workflowId: string }).workflowId, "comment-com_1");
  });

  it("treats already-started workflow as idempotent success", async () => {
    hoisted.startMock.mockRejectedValue(
      new hoisted.MockWorkflowExecutionAlreadyStartedError("already started")
    );

    const result = await startCommentWorkflow({
      accountId: "acc_1",
      commentId: "com_1"
    });

    assert.deepEqual(result, {
      workflowId: "comment-com_1",
      started: false,
      alreadyStarted: true
    });
  });

  it("runs workflow inline when orchestration mode is inline", async () => {
    process.env.COMMENT_ORCHESTRATION_MODE = "inline";
    hoisted.runCommentWorkflowMock.mockResolvedValue({
      route: "pending_review",
      candidateId: "cand_1",
      approvalTaskId: "task_1"
    });

    const result = await startCommentWorkflow({
      accountId: "acc_1",
      commentId: "com_inline_success_1"
    });
    await waitForInlineDispatch(1);

    assert.deepEqual(result, {
      workflowId: "comment-com_inline_success_1",
      started: true,
      alreadyStarted: false
    });
    assert.equal(hoisted.connectMock.mock.calls.length, 0);
    assert.equal(hoisted.startMock.mock.calls.length, 0);
    assert.equal(hoisted.runCommentWorkflowMock.mock.calls.length, 1);

    const [input, activities] = hoisted.runCommentWorkflowMock.mock.calls[0] as [
      { accountId: string; commentId: string },
      Record<string, unknown>
    ];
    assert.deepEqual(input, { accountId: "acc_1", commentId: "com_inline_success_1" });
    assert.equal(activities.logStage, hoisted.logStageMock);
    assert.equal(activities.buildContext, hoisted.buildContextMock);
    assert.equal(activities.interpretIntent, hoisted.interpretIntentMock);
    assert.equal(activities.generateDraft, hoisted.generateDraftMock);
    assert.equal(activities.runSafetyGate, hoisted.runSafetyGateMock);
    assert.equal(activities.routeAndPersist, hoisted.routeAndPersistMock);
  });

  it("accepts inline start even when workflow execution fails later", async () => {
    process.env.COMMENT_ORCHESTRATION_MODE = "inline";
    hoisted.runCommentWorkflowMock.mockRejectedValue(new Error("generation failure"));

    const result = await startCommentWorkflow({
      accountId: "acc_1",
      commentId: "com_inline_fail_1"
    });
    await waitForInlineDispatch(1);

    assert.deepEqual(result, {
      workflowId: "comment-com_inline_fail_1",
      started: true,
      alreadyStarted: false
    });
    assert.equal(hoisted.connectMock.mock.calls.length, 0);
    assert.equal(hoisted.startMock.mock.calls.length, 0);
    assert.equal(hoisted.runCommentWorkflowMock.mock.calls.length, 1);
  });

  it("deduplicates concurrent inline starts for the same comment", async () => {
    process.env.COMMENT_ORCHESTRATION_MODE = "inline";
    hoisted.runCommentWorkflowMock.mockImplementation(
      async () => await new Promise((resolve) => setTimeout(resolve, 20))
    );

    const dedupeCommentId = "com_inline_dedupe_1";
    const firstStart = startCommentWorkflow({
      accountId: "acc_1",
      commentId: dedupeCommentId
    });
    const secondStart = await startCommentWorkflow({
      accountId: "acc_1",
      commentId: dedupeCommentId
    });

    assert.deepEqual(secondStart, {
      workflowId: "comment-com_inline_dedupe_1",
      started: false,
      alreadyStarted: true
    });
    assert.equal(hoisted.connectMock.mock.calls.length, 0);
    assert.equal(hoisted.startMock.mock.calls.length, 0);

    const firstResult = await firstStart;
    assert.deepEqual(firstResult, {
      workflowId: "comment-com_inline_dedupe_1",
      started: true,
      alreadyStarted: false
    });
    await waitForInlineDispatch(1);
    assert.equal(hoisted.runCommentWorkflowMock.mock.calls.length, 1);
  });
});
