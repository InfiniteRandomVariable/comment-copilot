type SupportedPlatform = "instagram" | "tiktok";

interface SendPlatformReplyArgs {
  platform: SupportedPlatform;
  accessToken: string;
  platformCommentId: string;
  platformPostId: string;
  messageId?: string;
  replyText: string;
}

interface SendPlatformReplyResult {
  platformReplyId?: string;
}

function normalizeMessage(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function getTiktokReplyUrl() {
  return (
    process.env.TIKTOK_COMMENT_REPLY_URL?.trim() ??
    "https://open.tiktokapis.com/v2/comment/reply/"
  );
}

function getInstagramReplyUrlTemplate() {
  return (
    process.env.INSTAGRAM_COMMENT_REPLY_URL_TEMPLATE?.trim() ??
    "https://graph.facebook.com/v22.0/{comment_id}/replies"
  );
}

function buildInstagramReplyUrl(commentId: string) {
  const template = getInstagramReplyUrlTemplate();
  if (template.includes("{comment_id}")) {
    return template.replace("{comment_id}", encodeURIComponent(commentId));
  }

  const trimmed = template.endsWith("/") ? template.slice(0, -1) : template;
  return `${trimmed}/${encodeURIComponent(commentId)}/replies`;
}

function parseJsonOrNull(rawText: string) {
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getErrorMessageFromBody(rawText: string) {
  const parsed = parseJsonOrNull(rawText);
  if (
    parsed &&
    typeof parsed.error === "object" &&
    parsed.error !== null &&
    typeof (parsed.error as { message?: unknown }).message === "string"
  ) {
    return (parsed.error as { message: string }).message;
  }
  if (parsed && typeof parsed.message === "string") {
    return parsed.message;
  }
  return rawText.slice(0, 400);
}

async function sendInstagramReply(args: {
  accessToken: string;
  parentCommentId: string;
  replyText: string;
}): Promise<SendPlatformReplyResult> {
  const url = buildInstagramReplyUrl(args.parentCommentId);
  const body = new URLSearchParams({
    message: normalizeMessage(args.replyText),
    access_token: args.accessToken
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Instagram reply failed (${response.status}): ${getErrorMessageFromBody(responseText)}`
    );
  }

  const json = parseJsonOrNull(responseText);
  if (
    json &&
    typeof json.error === "object" &&
    json.error !== null
  ) {
    throw new Error(
      `Instagram reply failed: ${getErrorMessageFromBody(responseText)}`
    );
  }

  const platformReplyId =
    json && typeof json.id === "string" ? json.id : undefined;

  return { platformReplyId };
}

async function sendTiktokReply(args: {
  accessToken: string;
  parentCommentId: string;
  platformPostId: string;
  replyText: string;
}): Promise<SendPlatformReplyResult> {
  const url = getTiktokReplyUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      comment_id: args.parentCommentId,
      video_id: args.platformPostId,
      text: normalizeMessage(args.replyText)
    }),
    cache: "no-store"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `TikTok reply failed (${response.status}): ${getErrorMessageFromBody(responseText)}`
    );
  }

  const json = parseJsonOrNull(responseText);
  if (
    json &&
    typeof json.error === "object" &&
    json.error !== null
  ) {
    const errorObj = json.error as { code?: unknown; message?: unknown };
    const errorCode = errorObj.code;
    if (
      errorCode !== undefined &&
      errorCode !== 0 &&
      errorCode !== "ok" &&
      errorCode !== "0"
    ) {
      throw new Error(
        `TikTok reply failed: ${getErrorMessageFromBody(responseText)}`
      );
    }
  }

  const data =
    json && typeof json.data === "object" && json.data !== null
      ? (json.data as Record<string, unknown>)
      : null;

  const platformReplyId =
    (data && typeof data.comment_id === "string" && data.comment_id) ||
    (data && typeof data.id === "string" && data.id) ||
    (json && typeof json.comment_id === "string" && json.comment_id) ||
    (json && typeof json.id === "string" && json.id) ||
    undefined;

  return { platformReplyId };
}

export async function sendPlatformReply(
  args: SendPlatformReplyArgs
): Promise<SendPlatformReplyResult> {
  const parentCommentId = args.messageId?.trim() || args.platformCommentId.trim();
  const replyText = normalizeMessage(args.replyText);
  if (!parentCommentId) {
    throw new Error("Missing target comment/message id for reply");
  }
  if (!replyText) {
    throw new Error("Reply text cannot be empty");
  }

  if (args.platform === "instagram") {
    return sendInstagramReply({
      accessToken: args.accessToken,
      parentCommentId,
      replyText
    });
  }

  return sendTiktokReply({
    accessToken: args.accessToken,
    parentCommentId,
    platformPostId: args.platformPostId,
    replyText
  });
}
