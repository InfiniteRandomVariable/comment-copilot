import { NextRequest, NextResponse } from "next/server";
import { getConvexServerClient } from "../../../_lib/convexServer";
import {
  createWebhookObservabilityContext,
  logWebhookCompleted,
  logWebhookFailed
} from "../../../_lib/webhookObservability";
import { startCommentWorkflow } from "../../../_lib/temporal";
import { verifyTiktokWebhookSignature } from "../../../_lib/webhookSignatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const observability = createWebhookObservabilityContext({
    provider: "tiktok",
    route: "/api/webhooks/tiktok/comments",
    method: "POST"
  });

  try {
    const rawBody = await request.text();
    const verification = verifyTiktokWebhookSignature({
      rawBody,
      signatureHeader:
        request.headers.get("x-tiktok-signature") ??
        request.headers.get("x-tt-signature"),
      signingSecret:
        process.env.TIKTOK_WEBHOOK_SECRET ?? process.env.TIKTOK_CLIENT_SECRET,
      requestTimestampHeader:
        request.headers.get("x-tiktok-request-timestamp") ??
        request.headers.get("x-tt-request-time")
    });

    if (!verification.ok) {
      logWebhookFailed(observability, {
        statusCode: verification.status,
        errorCode: "tiktok_signature_verification_failed",
        errorMessage: verification.error
      });
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: verification.status }
      );
    }

    const body = JSON.parse(rawBody) as {
      accountId: string;
      platformCommentId: string;
      platformPostId: string;
      commenterPlatformId: string;
      text: string;
      messageId?: string;
      sourceVideoTitle?: string;
      commenterUsername?: string;
      commenterLatestVideoId?: string;
      commenterLatestVideoTitle?: string;
    };
    const client = getConvexServerClient();

    const ingestion = (await client.mutation(
      "comments:ingestPlatformComment" as never,
      {
        accountId: body.accountId,
        platform: "tiktok",
        platformCommentId: body.platformCommentId,
        platformPostId: body.platformPostId,
        commenterPlatformId: body.commenterPlatformId,
        text: body.text,
        messageId: body.messageId,
        sourceVideoTitle: body.sourceVideoTitle,
        commenterUsername: body.commenterUsername,
        commenterLatestVideoId: body.commenterLatestVideoId,
        commenterLatestVideoTitle: body.commenterLatestVideoTitle
      } as never
    )) as { commentId: string; created?: boolean };

    const workflowStarted = ingestion.created ?? true;
    if (workflowStarted) {
      await startCommentWorkflow({
        accountId: body.accountId,
        commentId: ingestion.commentId
      });
    }

    logWebhookCompleted(observability, {
      accountId: body.accountId,
      workflowStarted
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logWebhookFailed(observability, {
      statusCode: 500,
      errorCode: "tiktok_webhook_processing_failed",
      errorMessage: message
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
