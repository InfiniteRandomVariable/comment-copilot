import { NextRequest, NextResponse } from "next/server";
import { getConvexServerClient } from "../../../_lib/convexServer";
import { startCommentWorkflow } from "../../../_lib/temporal";
import { verifyInstagramWebhookSignature } from "../../../_lib/webhookSignatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const verifyToken = request.nextUrl.searchParams.get("hub.verify_token");
  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: "Missing Instagram webhook verify token" },
      { status: 500 }
    );
  }

  if (mode === "subscribe" && challenge && verifyToken === expectedToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  }

  return NextResponse.json(
    { ok: false, error: "Invalid Instagram webhook verification request" },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const verification = verifyInstagramWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
      appSecret:
        process.env.INSTAGRAM_WEBHOOK_SECRET ?? process.env.INSTAGRAM_APP_SECRET
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
    const client = getConvexServerClient();

    const ingestion = (await client.mutation(
      "comments:ingestPlatformComment" as never,
      {
        accountId: body.accountId,
        platform: "instagram",
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
