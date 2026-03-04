import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

type MutationCall = { fn: string; args: unknown };

function createMockClient(args: {
  mutation?: (fn: string, payload: unknown) => Promise<unknown>;
}) {
  const mutationCalls: MutationCall[] = [];

  return {
    mutationCalls,
    client: {
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
      mutation: (fn: string, payload: unknown) => Promise<unknown>;
    },
    startCommentWorkflow: vi.fn()
  };
});

vi.mock("../app/api/_lib/convexServer", () => ({
  getConvexServerClient: () => hoisted.client
}));

vi.mock("../app/api/_lib/temporal", () => ({
  startCommentWorkflow: (...args: unknown[]) => hoisted.startCommentWorkflow(...args)
}));

import { POST as postInstagramWebhook } from "../app/api/webhooks/instagram/comments/route";
import { POST as postTiktokWebhook } from "../app/api/webhooks/tiktok/comments/route";

function signInstagramPayload(rawBody: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function signTiktokPayload(rawBody: string, secret: string, timestamp: string) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function createPostRequest(args: {
  url: string;
  rawBody: string;
  headers: Record<string, string>;
}) {
  return new Request(args.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...args.headers
    },
    body: args.rawBody
  });
}

describe("Webhook Ingestion E2E Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.startCommentWorkflow.mockReset();
    delete process.env.INSTAGRAM_WEBHOOK_SECRET;
    delete process.env.TIKTOK_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.INSTAGRAM_WEBHOOK_SECRET;
    delete process.env.TIKTOK_WEBHOOK_SECRET;
  });

  it("ingests instagram webhook and triggers workflow when signature is valid", async () => {
    const payload = {
      accountId: "acc_ig_1",
      platformCommentId: "ig_comment_1",
      platformPostId: "ig_post_1",
      commenterPlatformId: "ig_user_1",
      text: "great post",
      commenterUsername: "igcreator"
    };
    const rawBody = JSON.stringify(payload);
    process.env.INSTAGRAM_WEBHOOK_SECRET = "ig_webhook_secret";

    const { client, mutationCalls } = createMockClient({
      mutation: async (fn) => {
        if (fn === "comments:ingestPlatformComment") {
          return { commentId: "convex_comment_ig_1" };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.startCommentWorkflow.mockResolvedValue({ workflowId: "workflow_ig_1" });

    const response = await postInstagramWebhook(
      createPostRequest({
        url: "https://app.local/api/webhooks/instagram/comments",
        rawBody,
        headers: {
          "x-hub-signature-256": signInstagramPayload(
            rawBody,
            process.env.INSTAGRAM_WEBHOOK_SECRET
          )
        }
      }) as never
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0]?.fn, "comments:ingestPlatformComment");
    assert.equal(
      (mutationCalls[0]?.args as { platform: string }).platform,
      "instagram"
    );
    assert.equal(hoisted.startCommentWorkflow.mock.calls.length, 1);
    assert.deepEqual(hoisted.startCommentWorkflow.mock.calls[0]?.[0], {
      accountId: "acc_ig_1",
      commentId: "convex_comment_ig_1"
    });
  });

  it("rejects instagram webhook with invalid signature and does not ingest", async () => {
    const payload = {
      accountId: "acc_ig_1",
      platformCommentId: "ig_comment_2",
      platformPostId: "ig_post_2",
      commenterPlatformId: "ig_user_2",
      text: "hello"
    };
    const rawBody = JSON.stringify(payload);
    process.env.INSTAGRAM_WEBHOOK_SECRET = "ig_webhook_secret";

    const { client, mutationCalls } = createMockClient({});
    hoisted.client = client as never;

    const response = await postInstagramWebhook(
      createPostRequest({
        url: "https://app.local/api/webhooks/instagram/comments",
        rawBody,
        headers: {
          "x-hub-signature-256": "sha256=invalid"
        }
      }) as never
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "Invalid Instagram signature"
    });
    assert.equal(mutationCalls.length, 0);
    assert.equal(hoisted.startCommentWorkflow.mock.calls.length, 0);
  });

  it("ingests tiktok webhook and triggers workflow when signature is valid", async () => {
    const payload = {
      accountId: "acc_tt_1",
      platformCommentId: "tt_comment_1",
      platformPostId: "tt_post_1",
      commenterPlatformId: "tt_user_1",
      text: "nice video",
      commenterLatestVideoId: "latest_video_1"
    };
    const rawBody = JSON.stringify(payload);
    const requestTimestamp = "1710000000";
    process.env.TIKTOK_WEBHOOK_SECRET = "tiktok_webhook_secret";

    const { client, mutationCalls } = createMockClient({
      mutation: async (fn) => {
        if (fn === "comments:ingestPlatformComment") {
          return { commentId: "convex_comment_tt_1" };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.startCommentWorkflow.mockResolvedValue({ workflowId: "workflow_tt_1" });

    const response = await postTiktokWebhook(
      createPostRequest({
        url: "https://app.local/api/webhooks/tiktok/comments",
        rawBody,
        headers: {
          "x-tiktok-signature": signTiktokPayload(
            rawBody,
            process.env.TIKTOK_WEBHOOK_SECRET,
            requestTimestamp
          ),
          "x-tiktok-request-timestamp": requestTimestamp
        }
      }) as never
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0]?.fn, "comments:ingestPlatformComment");
    assert.equal((mutationCalls[0]?.args as { platform: string }).platform, "tiktok");
    assert.equal(hoisted.startCommentWorkflow.mock.calls.length, 1);
    assert.deepEqual(hoisted.startCommentWorkflow.mock.calls[0]?.[0], {
      accountId: "acc_tt_1",
      commentId: "convex_comment_tt_1"
    });
  });

  it("rejects tiktok webhook when signature header is missing", async () => {
    const payload = {
      accountId: "acc_tt_2",
      platformCommentId: "tt_comment_2",
      platformPostId: "tt_post_2",
      commenterPlatformId: "tt_user_2",
      text: "hi there"
    };
    const rawBody = JSON.stringify(payload);
    process.env.TIKTOK_WEBHOOK_SECRET = "tiktok_webhook_secret";

    const { client, mutationCalls } = createMockClient({});
    hoisted.client = client as never;

    const response = await postTiktokWebhook(
      createPostRequest({
        url: "https://app.local/api/webhooks/tiktok/comments",
        rawBody,
        headers: {}
      }) as never
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "Missing TikTok signature header"
    });
    assert.equal(mutationCalls.length, 0);
    assert.equal(hoisted.startCommentWorkflow.mock.calls.length, 0);
  });

  it("does not start instagram workflow when ingest reports duplicate delivery", async () => {
    const payload = {
      accountId: "acc_ig_1",
      platformCommentId: "ig_comment_dup_1",
      platformPostId: "ig_post_1",
      commenterPlatformId: "ig_user_1",
      text: "duplicate"
    };
    const rawBody = JSON.stringify(payload);
    process.env.INSTAGRAM_WEBHOOK_SECRET = "ig_webhook_secret";

    const { client, mutationCalls } = createMockClient({
      mutation: async (fn) => {
        if (fn === "comments:ingestPlatformComment") {
          return { commentId: "convex_comment_ig_dup", created: false };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.startCommentWorkflow.mockResolvedValue({ workflowId: "workflow_ig_dup" });

    const response = await postInstagramWebhook(
      createPostRequest({
        url: "https://app.local/api/webhooks/instagram/comments",
        rawBody,
        headers: {
          "x-hub-signature-256": signInstagramPayload(
            rawBody,
            process.env.INSTAGRAM_WEBHOOK_SECRET
          )
        }
      }) as never
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(mutationCalls.length, 1);
    assert.equal(hoisted.startCommentWorkflow.mock.calls.length, 0);
  });

  it("does not start tiktok workflow when ingest reports duplicate delivery", async () => {
    const payload = {
      accountId: "acc_tt_1",
      platformCommentId: "tt_comment_dup_1",
      platformPostId: "tt_post_1",
      commenterPlatformId: "tt_user_1",
      text: "duplicate"
    };
    const rawBody = JSON.stringify(payload);
    const requestTimestamp = "1710000000";
    process.env.TIKTOK_WEBHOOK_SECRET = "tiktok_webhook_secret";

    const { client, mutationCalls } = createMockClient({
      mutation: async (fn) => {
        if (fn === "comments:ingestPlatformComment") {
          return { commentId: "convex_comment_tt_dup", created: false };
        }
        return null;
      }
    });
    hoisted.client = client as never;
    hoisted.startCommentWorkflow.mockResolvedValue({ workflowId: "workflow_tt_dup" });

    const response = await postTiktokWebhook(
      createPostRequest({
        url: "https://app.local/api/webhooks/tiktok/comments",
        rawBody,
        headers: {
          "x-tiktok-signature": signTiktokPayload(
            rawBody,
            process.env.TIKTOK_WEBHOOK_SECRET,
            requestTimestamp
          ),
          "x-tiktok-request-timestamp": requestTimestamp
        }
      }) as never
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(mutationCalls.length, 1);
    assert.equal(hoisted.startCommentWorkflow.mock.calls.length, 0);
  });
});
