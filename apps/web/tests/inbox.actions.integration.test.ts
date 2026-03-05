import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

type QueryCall = { fn: string; args: unknown };
type MutationCall = { fn: string; args: unknown };

function createMockClient(args: {
  query?: (fn: string, payload: unknown) => Promise<unknown>;
  mutation?: (fn: string, payload: unknown) => Promise<unknown>;
}) {
  const queryCalls: QueryCall[] = [];
  const mutationCalls: MutationCall[] = [];

  return {
    queryCalls,
    mutationCalls,
    client: {
      query: async (fn: string, payload: unknown) => {
        queryCalls.push({ fn, args: payload });
        return args.query ? args.query(fn, payload) : null;
      },
      mutation: async (fn: string, payload: unknown) => {
        mutationCalls.push({ fn, args: payload });
        return args.mutation ? args.mutation(fn, payload) : null;
      }
    }
  };
}

const hoisted = vi.hoisted(() => {
  return {
    client: null as unknown as {
      query: (fn: string, payload: unknown) => Promise<unknown>;
      mutation: (fn: string, payload: unknown) => Promise<unknown>;
    },
    lastRedirectUrl: "",
    sendPlatformReply: vi.fn(),
    unsealToken: vi.fn((tokenRef: string) => `raw:${tokenRef}`)
  };
});

vi.mock("../app/api/_lib/convexServer", () => ({
  getConvexServerClient: () => hoisted.client
}));

vi.mock("../app/api/_lib/platformReplies", () => ({
  sendPlatformReply: (...args: unknown[]) => hoisted.sendPlatformReply(...args)
}));

vi.mock("../app/api/_lib/tokenVault", () => ({
  unsealToken: (tokenRef: string) => hoisted.unsealToken(tokenRef)
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    hoisted.lastRedirectUrl = url;
    throw new Error("__REDIRECT__");
  }
}));

import {
  approveCandidateAction,
  rejectCandidateAction,
  sendCandidateAction
} from "../app/inbox/actions";
import {
  filterInboxItems,
  normalizeInboxFilters,
  summarizeInboxQueue
} from "../app/inbox/filtering";

const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

function createSendForm(overrides?: Record<string, string>) {
  const values = {
    accountId: "acc_1",
    candidateId: "cand_1",
    ownerUserId: "owner_1",
    editedText: "Thanks for your comment!",
    originalText: "Thanks for your comment!"
  };
  const merged = { ...values, ...(overrides ?? {}) };
  const form = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    form.set(key, value);
  }
  return form;
}

function createApproveForm(overrides?: Record<string, string>) {
  const values = {
    accountId: "acc_1",
    candidateId: "cand_1",
    ownerUserId: "owner_1"
  };
  const merged = { ...values, ...(overrides ?? {}) };
  const form = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    form.set(key, value);
  }
  return form;
}

function createRejectForm(overrides?: Record<string, string>) {
  const values = {
    accountId: "acc_1",
    candidateId: "cand_1",
    ownerUserId: "owner_1"
  };
  const merged = { ...values, ...(overrides ?? {}) };
  const form = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    form.set(key, value);
  }
  return form;
}

function parseRedirectUrl(pathWithQuery: string) {
  return new URL(pathWithQuery, "https://app.local");
}

function collectStructuredEventNames(calls: unknown[][]) {
  const events: string[] = [];

  for (const call of calls) {
    for (const arg of call) {
      if (typeof arg !== "string") {
        continue;
      }
      try {
        const parsed = JSON.parse(arg) as { event?: unknown };
        if (typeof parsed.event === "string") {
          events.push(parsed.event);
        }
      } catch {
        // Ignore non-JSON log arguments.
      }
    }
  }

  return events;
}

function countEvent(events: string[], expectedEvent: string) {
  return events.filter((eventName) => eventName === expectedEvent).length;
}

const defaultSendContext = {
  account: {
    _id: "acc_1",
    platform: "tiktok" as const,
    platformAccountId: "plat_acc_1"
  },
  comment: {
    _id: "com_1",
    platform: "tiktok" as const,
    platformCommentId: "comment_123",
    platformPostId: "video_456",
    messageId: "msg_abc",
    status: "pending_review"
  },
  candidate: {
    _id: "cand_1",
    commentId: "com_1",
    messageId: "msg_abc",
    text: "Thanks for your comment!",
    status: "pending_review" as const
  },
  socialAccount: {
    accessTokenRef: "sealed_access"
  }
};

describe("Inbox Send Candidate Action idempotency", () => {
  beforeEach(() => {
    hoisted.lastRedirectUrl = "";
    hoisted.sendPlatformReply.mockReset();
    hoisted.unsealToken.mockClear();
    vi.clearAllMocks();
  });

  it("reuses existing send receipt and skips provider post", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") {
          return { platformReplyId: "platform_reply_existing" };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called when receipt exists");
    });

    await assert.rejects(
      sendCandidateAction(createSendForm()),
      /__REDIRECT__/
    );

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:recordPlatformSendReceipt"),
      false
    );

    const approveMutation = mutationCalls.find(
      (call) => call.fn === "reviews:approveAndSendCandidate"
    );
    assert.ok(approveMutation, "Expected approveAndSendCandidate mutation");
    assert.equal(
      (approveMutation!.args as { platformReplyId?: string }).platformReplyId,
      "platform_reply_existing"
    );
    const cleanupMutation = mutationCalls.find(
      (call) => call.fn === "reviews:cleanupResolvedMessageData"
    );
    assert.ok(cleanupMutation, "Expected cleanupResolvedMessageData mutation");
    assert.equal(
      (cleanupMutation!.args as { resolution: string }).resolution,
      "sent"
    );
    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_hit"), 1);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_miss"), 0);

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "approved_and_sent");
    assert.equal(redirectUrl.searchParams.get("error"), null);
  });

  it("approve flow reuses existing send receipt and skips provider post", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") {
          return { platformReplyId: "platform_reply_existing" };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called when receipt exists");
    });

    await assert.rejects(
      approveCandidateAction(createApproveForm()),
      /__REDIRECT__/
    );

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:recordPlatformSendReceipt"),
      false
    );

    const approveMutation = mutationCalls.find(
      (call) => call.fn === "reviews:approveAndSendCandidate"
    );
    assert.ok(approveMutation, "Expected approveAndSendCandidate mutation");
    assert.equal(
      (approveMutation!.args as { platformReplyId?: string }).platformReplyId,
      "platform_reply_existing"
    );
    const cleanupMutation = mutationCalls.find(
      (call) => call.fn === "reviews:cleanupResolvedMessageData"
    );
    assert.ok(cleanupMutation, "Expected cleanupResolvedMessageData mutation");
    assert.equal(
      (cleanupMutation!.args as { resolution: string }).resolution,
      "sent"
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "approved");
    assert.equal(redirectUrl.searchParams.get("error"), null);
    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.already_sent_noop"), 0);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_hit"), 1);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_miss"), 0);
  });

  it("treats already sent candidate as idempotent no-op in send flow", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") {
          return {
            ...defaultSendContext,
            comment: {
              ...defaultSendContext.comment,
              status: "post_send_like_done"
            },
            candidate: {
              ...defaultSendContext.candidate,
              status: "sent" as const
            }
          };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called for finalized candidates");
    });

    await assert.rejects(sendCandidateAction(createSendForm()), /__REDIRECT__/);

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:approveAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:editAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "drafts:updateCandidateStatus"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "comments:updateCommentStatus"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:cleanupResolvedMessageData"),
      true
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "engagement:likeCommenterVideoIfAvailable"),
      false
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "approved_and_sent");
    assert.equal(redirectUrl.searchParams.get("error"), null);
  });

  it("treats already sent candidate as idempotent no-op in approve flow", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") {
          return {
            ...defaultSendContext,
            comment: {
              ...defaultSendContext.comment,
              status: "post_send_like_done"
            },
            candidate: {
              ...defaultSendContext.candidate,
              status: "sent" as const
            }
          };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called for finalized candidates");
    });

    await assert.rejects(approveCandidateAction(createApproveForm()), /__REDIRECT__/);

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:approveAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "drafts:updateCandidateStatus"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "comments:updateCommentStatus"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:cleanupResolvedMessageData"),
      true
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "engagement:likeCommenterVideoIfAvailable"),
      false
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "approved");
    assert.equal(redirectUrl.searchParams.get("error"), null);
  });

  it("runs post-send-like before cleanup for already-sent retries when like status is not finalized", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") {
          return {
            ...defaultSendContext,
            comment: {
              ...defaultSendContext.comment,
              status: "sent"
            },
            candidate: {
              ...defaultSendContext.candidate,
              status: "sent" as const
            }
          };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called for finalized candidates");
    });

    await assert.rejects(sendCandidateAction(createSendForm()), /__REDIRECT__/);

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    const likeMutationIndex = mutationCalls.findIndex(
      (call) => call.fn === "engagement:likeCommenterVideoIfAvailable"
    );
    const cleanupMutationIndex = mutationCalls.findIndex(
      (call) => call.fn === "reviews:cleanupResolvedMessageData"
    );
    assert.ok(likeMutationIndex >= 0, "Expected post-send-like mutation on retry");
    assert.ok(cleanupMutationIndex >= 0, "Expected cleanup mutation on retry");
    assert.ok(
      likeMutationIndex < cleanupMutationIndex,
      "Expected post-send-like before cleanup"
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "approved_and_sent");
    assert.equal(redirectUrl.searchParams.get("error"), null);
  });

  it("blocks send flow when candidate is rejected", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") {
          return {
            ...defaultSendContext,
            candidate: {
              ...defaultSendContext.candidate,
              status: "rejected" as const
            }
          };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called for rejected candidates");
    });

    await assert.rejects(sendCandidateAction(createSendForm()), /__REDIRECT__/);

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:approveAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:editAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "drafts:updateCandidateStatus"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "comments:updateCommentStatus"),
      false
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), null);
    assert.equal(
      redirectUrl.searchParams.get("error"),
      "Candidate is not sendable from status: rejected"
    );
    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.already_sent_noop"), 0);
  });

  it("blocks approve flow when candidate is rejected", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") {
          return {
            ...defaultSendContext,
            candidate: {
              ...defaultSendContext.candidate,
              status: "rejected" as const
            }
          };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called for rejected candidates");
    });

    await assert.rejects(approveCandidateAction(createApproveForm()), /__REDIRECT__/);

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:approveAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "drafts:updateCandidateStatus"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "comments:updateCommentStatus"),
      false
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), null);
    assert.equal(
      redirectUrl.searchParams.get("error"),
      "Candidate is not sendable from status: rejected"
    );
    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.already_sent_noop"), 0);
  });

  it("treats edited_and_sent candidate as idempotent no-op in send flow", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") {
          return {
            ...defaultSendContext,
            comment: {
              ...defaultSendContext.comment,
              status: "post_send_like_done"
            },
            candidate: {
              ...defaultSendContext.candidate,
              status: "edited_and_sent" as const
            }
          };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockImplementation(async () => {
      throw new Error("Provider should not be called for finalized candidates");
    });

    await assert.rejects(sendCandidateAction(createSendForm()), /__REDIRECT__/);

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 0);
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:approveAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:editAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:cleanupResolvedMessageData"),
      true
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "engagement:likeCommenterVideoIfAvailable"),
      false
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "edited_and_sent");
    assert.equal(redirectUrl.searchParams.get("error"), null);
    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.already_sent_noop"), 1);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_hit"), 0);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_miss"), 0);
  });

  it("creates send receipt after successful provider post", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") return null;
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockResolvedValue({
      platformReplyId: "platform_reply_new"
    });

    await assert.rejects(
      sendCandidateAction(
        createSendForm({
          editedText: "Updated reply copy",
          originalText: "Thanks for your comment!"
        })
      ),
      /__REDIRECT__/
    );

    assert.equal(hoisted.sendPlatformReply.mock.calls.length, 1);

    const receiptMutation = mutationCalls.find(
      (call) => call.fn === "reviews:recordPlatformSendReceipt"
    );
    assert.ok(receiptMutation, "Expected recordPlatformSendReceipt mutation");
    assert.equal(
      (receiptMutation!.args as { platformReplyId?: string }).platformReplyId,
      "platform_reply_new"
    );
    assert.equal(
      (receiptMutation!.args as { sentBy: string }).sentBy,
      "owner_edited"
    );

    const sendMutation = mutationCalls.find(
      (call) => call.fn === "reviews:editAndSendCandidate"
    );
    assert.ok(sendMutation, "Expected editAndSendCandidate mutation");
    assert.equal(
      (sendMutation!.args as { platformReplyId?: string }).platformReplyId,
      "platform_reply_new"
    );
    const cleanupMutation = mutationCalls.find(
      (call) => call.fn === "reviews:cleanupResolvedMessageData"
    );
    assert.ok(cleanupMutation, "Expected cleanupResolvedMessageData mutation");
    assert.equal(
      (cleanupMutation!.args as { resolution: string }).resolution,
      "edited_and_sent"
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "edited_and_sent");
    assert.equal(redirectUrl.searchParams.get("error"), null);
  });

  it("continues send finalization when receipt write fails after provider success", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") return null;
        return null;
      },
      mutation: async (fn) => {
        if (fn === "reviews:recordPlatformSendReceipt") {
          throw new Error("receipt_write_failed");
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockResolvedValue({
      platformReplyId: "platform_reply_after_receipt_error"
    });

    await assert.rejects(
      sendCandidateAction(createSendForm()),
      /__REDIRECT__/
    );

    const approveMutation = mutationCalls.find(
      (call) => call.fn === "reviews:approveAndSendCandidate"
    );
    assert.ok(approveMutation, "Expected approveAndSendCandidate mutation");
    assert.equal(
      (approveMutation!.args as { platformReplyId?: string }).platformReplyId,
      "platform_reply_after_receipt_error"
    );

    const auditMutation = mutationCalls.find(
      (call) => call.fn === "reviews:logPlatformSendReceiptWriteFailure"
    );
    assert.ok(auditMutation, "Expected logPlatformSendReceiptWriteFailure mutation");
    assert.equal(
      (auditMutation!.args as { errorMessage: string }).errorMessage,
      "receipt_write_failed"
    );

    const fallbackReplySentMutation = mutationCalls.find(
      (call) => call.fn === "reviews:recordProviderSendFallbackReplySent"
    );
    assert.ok(
      fallbackReplySentMutation,
      "Expected recordProviderSendFallbackReplySent mutation"
    );
    assert.equal(
      (fallbackReplySentMutation!.args as { platformReplyId?: string }).platformReplyId,
      "platform_reply_after_receipt_error"
    );
    const cleanupMutation = mutationCalls.find(
      (call) => call.fn === "reviews:cleanupResolvedMessageData"
    );
    assert.ok(cleanupMutation, "Expected cleanupResolvedMessageData mutation");
    assert.equal(
      (cleanupMutation!.args as { resolution: string }).resolution,
      "sent"
    );
    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    const warnEvents = collectStructuredEventNames(consoleWarnSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_miss"), 1);
    assert.equal(countEvent(warnEvents, "inbox_send.receipt_write_failed"), 1);
    assert.equal(
      countEvent(infoEvents, "inbox_send.fallback_reply_sent_write_succeeded"),
      1
    );

    assert.equal(
      mutationCalls.some((call) => call.fn === "drafts:updateCandidateStatus"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "comments:updateCommentStatus"),
      false
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "approved_and_sent");
    assert.equal(redirectUrl.searchParams.get("error"), null);
  });

  it("does not re-send to provider on retry when receipt write and finalization fail initially", async () => {
    let attempt = 0;
    let fallbackReplySentPersisted = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") {
          return fallbackReplySentPersisted
            ? { platformReplyId: "platform_reply_retry_safe" }
            : null;
        }
        return null;
      },
      mutation: async (fn) => {
        if (fn === "reviews:recordPlatformSendReceipt") {
          throw new Error("receipt_write_failed");
        }
        if (fn === "reviews:recordProviderSendFallbackReplySent") {
          fallbackReplySentPersisted = true;
          return null;
        }
        if (fn === "reviews:approveAndSendCandidate") {
          if (attempt === 0) {
            throw new Error("finalize_failed");
          }
          return null;
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockResolvedValue({
      platformReplyId: "platform_reply_retry_safe"
    });

    await assert.rejects(sendCandidateAction(createSendForm()), /__REDIRECT__/);
    const firstRedirect = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(firstRedirect.searchParams.get("error"), "finalize_failed");
    attempt = 1;

    await assert.rejects(sendCandidateAction(createSendForm()), /__REDIRECT__/);
    const secondRedirect = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(secondRedirect.searchParams.get("result"), "approved_and_sent");
    assert.equal(secondRedirect.searchParams.get("error"), null);

    assert.equal(
      hoisted.sendPlatformReply.mock.calls.length,
      1,
      "Provider should only be called on first attempt"
    );
    assert.ok(
      mutationCalls.some((call) => call.fn === "reviews:recordProviderSendFallbackReplySent"),
      "Expected fallback repliesSent persistence on first attempt"
    );
    assert.ok(
      mutationCalls.some((call) => call.fn === "drafts:updateCandidateStatus"),
      "Expected send_failed mark after first finalization failure"
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:cleanupResolvedMessageData"),
      true,
      "Expected cleanup after successful retry"
    );
    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_miss"), 1);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_hit"), 1);
  });

  it("does not re-send edited reply on retry when receipt write and edit finalization fail initially", async () => {
    let attempt = 0;
    let fallbackReplySentPersisted = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") {
          return fallbackReplySentPersisted
            ? { platformReplyId: "platform_reply_retry_edited" }
            : null;
        }
        return null;
      },
      mutation: async (fn) => {
        if (fn === "reviews:recordPlatformSendReceipt") {
          throw new Error("receipt_write_failed");
        }
        if (fn === "reviews:recordProviderSendFallbackReplySent") {
          fallbackReplySentPersisted = true;
          return null;
        }
        if (fn === "reviews:editAndSendCandidate") {
          if (attempt === 0) {
            throw new Error("finalize_edit_failed");
          }
          return null;
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockResolvedValue({
      platformReplyId: "platform_reply_retry_edited"
    });

    const editedSendForm = createSendForm({
      editedText: "Updated reply copy",
      originalText: "Thanks for your comment!"
    });

    await assert.rejects(sendCandidateAction(editedSendForm), /__REDIRECT__/);
    const firstRedirect = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(firstRedirect.searchParams.get("error"), "finalize_edit_failed");
    attempt = 1;

    await assert.rejects(sendCandidateAction(editedSendForm), /__REDIRECT__/);
    const secondRedirect = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(secondRedirect.searchParams.get("result"), "edited_and_sent");
    assert.equal(secondRedirect.searchParams.get("error"), null);

    assert.equal(
      hoisted.sendPlatformReply.mock.calls.length,
      1,
      "Provider should only be called on first edited-send attempt"
    );

    const fallbackReplySentMutation = mutationCalls.find(
      (call) => call.fn === "reviews:recordProviderSendFallbackReplySent"
    );
    assert.ok(
      fallbackReplySentMutation,
      "Expected fallback repliesSent persistence for edited-send path"
    );
    assert.equal(
      (fallbackReplySentMutation!.args as { sentBy: string }).sentBy,
      "owner_edited"
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:cleanupResolvedMessageData"),
      true,
      "Expected cleanup after successful edited-send retry"
    );

    const infoEvents = collectStructuredEventNames(consoleInfoSpy.mock.calls);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_miss"), 1);
    assert.equal(countEvent(infoEvents, "inbox_send.dedupe_hit"), 1);
  });

  it("marks send_failed when provider post throws", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") return null;
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.sendPlatformReply.mockRejectedValue(new Error("provider_down"));

    await assert.rejects(
      sendCandidateAction(createSendForm()),
      /__REDIRECT__/
    );

    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:approveAndSendCandidate"),
      false
    );
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:editAndSendCandidate"),
      false
    );

    const candidateFailedMutation = mutationCalls.find(
      (call) => call.fn === "drafts:updateCandidateStatus"
    );
    assert.ok(candidateFailedMutation, "Expected drafts:updateCandidateStatus");
    assert.equal(
      (candidateFailedMutation!.args as { status: string }).status,
      "send_failed"
    );

    const commentFailedMutation = mutationCalls.find(
      (call) => call.fn === "comments:updateCommentStatus"
    );
    assert.ok(commentFailedMutation, "Expected comments:updateCommentStatus");
    assert.equal(
      (commentFailedMutation!.args as { status: string }).status,
      "send_failed"
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), null);
    assert.equal(redirectUrl.searchParams.get("error"), "provider_down");
    assert.equal(
      mutationCalls.some((call) => call.fn === "reviews:cleanupResolvedMessageData"),
      false
    );
  });

  it("preserves queue context params in approve redirect", async () => {
    const { client } = createMockClient({
      query: async (fn) => {
        if (fn === "reviews:getCandidateSendContext") return defaultSendContext;
        if (fn === "reviews:getPlatformSendReceipt") {
          return { platformReplyId: "platform_reply_existing" };
        }
        return null;
      }
    });
    hoisted.client = client as never;

    await assert.rejects(
      approveCandidateAction(
        createApproveForm({
          cursor: "1700000000000",
          history: "root,1700000100000",
          platform: "instagram",
          intent: "question",
          q: "shipping"
        })
      ),
      /__REDIRECT__/
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "approved");
    assert.equal(redirectUrl.searchParams.get("cursor"), "1700000000000");
    assert.equal(redirectUrl.searchParams.get("history"), "root,1700000100000");
    assert.equal(redirectUrl.searchParams.get("platform"), "instagram");
    assert.equal(redirectUrl.searchParams.get("intent"), "question");
    assert.equal(redirectUrl.searchParams.get("q"), "shipping");
  });

  it("preserves queue context params in reject redirect", async () => {
    const { client } = createMockClient({});
    hoisted.client = client as never;

    await assert.rejects(
      rejectCandidateAction(
        createRejectForm({
          cursor: "1700000000000",
          history: "root,1700000100000",
          platform: "tiktok",
          intent: "praise",
          q: "drop"
        })
      ),
      /__REDIRECT__/
    );

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "rejected");
    assert.equal(redirectUrl.searchParams.get("cursor"), "1700000000000");
    assert.equal(redirectUrl.searchParams.get("history"), "root,1700000100000");
    assert.equal(redirectUrl.searchParams.get("platform"), "tiktok");
    assert.equal(redirectUrl.searchParams.get("intent"), "praise");
    assert.equal(redirectUrl.searchParams.get("q"), "drop");
  });

  it("calls reject mutation for reject flow", async () => {
    const { client, mutationCalls } = createMockClient({});
    hoisted.client = client as never;

    await assert.rejects(rejectCandidateAction(createRejectForm()), /__REDIRECT__/);

    const rejectMutation = mutationCalls.find(
      (call) => call.fn === "reviews:rejectCandidate"
    );
    assert.ok(rejectMutation, "Expected rejectCandidate mutation");

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("result"), "rejected");
    assert.equal(redirectUrl.searchParams.get("error"), null);
  });
});


describe("Inbox filtering helpers", () => {
  const nowTs = 1_700_000_000_000;
  const sampleItems = [
    {
      candidate: {
        text: "Thanks for asking about shipping windows",
        intentLabel: "question",
        messageId: "msg_1",
        createdAt: nowTs - 20 * 60 * 1000
      },
      comment: {
        text: "When will this ship?",
        platform: "instagram" as const,
        platformCommentId: "ig_comment_1",
        commenterUsername: "alice"
      }
    },
    {
      candidate: {
        text: "Appreciate your support",
        intentLabel: "praise",
        messageId: "msg_2",
        createdAt: nowTs - 80 * 60 * 1000
      },
      comment: {
        text: "Love this drop",
        platform: "tiktok" as const,
        platformCommentId: "tt_comment_2",
        commenterUsername: "bob"
      }
    },
    {
      candidate: {
        text: "Could this fit my setup?",
        intentLabel: "question",
        messageId: "msg_3",
        createdAt: nowTs - 500 * 60 * 1000
      },
      comment: {
        text: "Need sizing help",
        platform: "instagram" as const,
        platformCommentId: "ig_comment_3",
        commenterUsername: "charlie"
      }
    }
  ];

  it("normalizes unsupported filter values to safe defaults", () => {
    const filters = normalizeInboxFilters({
      platform: "youtube",
      intent: "random",
      q: "  shipping  "
    });

    assert.deepEqual(filters, {
      platform: "all",
      intent: "all",
      q: "shipping"
    });
  });

  it("filters by platform, intent, and search query", () => {
    const filters = normalizeInboxFilters({
      platform: "instagram",
      intent: "question",
      q: "shipping"
    });

    const filtered = filterInboxItems(sampleItems, filters);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.comment.platformCommentId, "ig_comment_1");
  });

  it("summarizes queue counts and staleness for triage clarity", () => {
    const summary = summarizeInboxQueue(sampleItems, nowTs);

    assert.equal(summary.total, 3);
    assert.deepEqual(summary.byPlatform, {
      instagram: 2,
      tiktok: 1
    });
    assert.deepEqual(summary.byIntent[0], {
      intent: "question",
      count: 2
    });
    assert.deepEqual(summary.queueAge, {
      oldestAgeMinutes: 500,
      staleOver1hCount: 2,
      staleOver6hCount: 1
    });
  });
});
