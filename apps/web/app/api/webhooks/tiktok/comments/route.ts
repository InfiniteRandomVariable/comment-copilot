import { NextRequest, NextResponse } from "next/server";
import { getConvexServerClient } from "../../../_lib/convexServer";
import { reportErrorTrackingEvent } from "../../../_lib/errorTracking";
import { startCommentWorkflow } from "../../../_lib/temporal";
import { verifyTiktokWebhookSignature } from "../../../_lib/webhookSignatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let accountId: string | undefined;

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
    accountId = body.accountId;
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

    if (ingestion.created ?? true) {
      await startCommentWorkflow({
        accountId: body.accountId,
        commentId: ingestion.commentId
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await reportErrorTrackingEvent({
      source: "webhook:tiktok_comments",
      category: "webhook_processing_failed",
      message,
      metadata: {
        route: "/api/webhooks/tiktok/comments",
        accountId,
        statusCode: 500
      }
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
