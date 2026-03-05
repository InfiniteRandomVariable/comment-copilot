"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { getConvexServerClient } from "../api/_lib/convexServer";
import { unsealToken } from "../api/_lib/tokenVault";
import { sendPlatformReply } from "../api/_lib/platformReplies";

function getRequiredValue(formData: FormData, key: string) {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }
  return value;
}

function getOptionalValue(formData: FormData, key: string) {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length > 0 ? value : undefined;
}

function normalizeReplyText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hashReplyText(value: string) {
  return createHash("sha256").update(normalizeReplyText(value)).digest("hex");
}

function logInboxSendInfo(eventName: string, payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      event: `inbox_send.${eventName}`,
      ...payload
    })
  );
}

function logInboxSendWarn(eventName: string, payload: Record<string, unknown>) {
  console.warn(
    JSON.stringify({
      event: `inbox_send.${eventName}`,
      ...payload
    })
  );
}

function buildInboxRedirectUrl(args: {
  accountId: string;
  cursor?: string;
  history?: string;
  platform?: string;
  intent?: string;
  ageBand?: string;
  q?: string;
  result?: string;
  error?: string;
}) {
  const params = new URLSearchParams({ accountId: args.accountId });

  if (args.cursor) {
    params.set("cursor", args.cursor);
  }

  if (args.history) {
    params.set("history", args.history);
  }

  if (args.platform) {
    params.set("platform", args.platform);
  }

  if (args.intent) {
    params.set("intent", args.intent);
  }

  if (args.ageBand) {
    params.set("ageBand", args.ageBand);
  }

  if (args.q) {
    params.set("q", args.q);
  }

  if (args.result) {
    params.set("result", args.result);
  }

  if (args.error) {
    params.set("error", args.error);
  }

  return `/inbox?${params.toString()}`;
}

async function runPostSendLike(candidateId: string) {
  const client = getConvexServerClient();
  await client.mutation(
    "engagement:likeCommenterVideoIfAvailable" as never,
    {
      candidateId
    } as never
  );
}

async function cleanupResolvedMessageData(args: {
  candidateId: string;
  ownerUserId: string;
  resolution: "sent" | "edited_and_sent";
}) {
  const client = getConvexServerClient();
  await client.mutation(
    "reviews:cleanupResolvedMessageData" as never,
    {
      candidateId: args.candidateId,
      ownerUserId: args.ownerUserId,
      resolution: args.resolution
    } as never
  );
}

type CandidateSendContext = {
  account: {
    _id: string;
    platform: "instagram" | "tiktok";
    platformAccountId: string;
  };
  comment: {
    _id: string;
    platform: "instagram" | "tiktok";
    platformCommentId: string;
    platformPostId: string;
    messageId?: string;
    status?: string;
  };
  candidate: {
    _id: string;
    commentId: string;
    messageId?: string;
    text: string;
    status:
      | "pending_review"
      | "approved"
      | "edited_and_sent"
      | "rejected"
      | "send_failed"
      | "sent";
  };
  socialAccount: {
    accessTokenRef: string;
  } | null;
};

function isCandidateAlreadySent(status: CandidateSendContext["candidate"]["status"]) {
  return status === "sent" || status === "edited_and_sent";
}

function isPostSendLikeFinalStatus(status?: string) {
  return status === "post_send_like_done" || status === "post_send_like_skipped";
}

async function finalizeAlreadySentCandidate(args: {
  context: CandidateSendContext;
  candidateId: string;
  ownerUserId: string;
}) {
  if (!isPostSendLikeFinalStatus(args.context.comment.status)) {
    await runPostSendLike(args.candidateId);
  }

  await cleanupResolvedMessageData({
    candidateId: args.candidateId,
    ownerUserId: args.ownerUserId,
    resolution: args.context.candidate.status === "edited_and_sent" ? "edited_and_sent" : "sent"
  });
}

function assertCandidateCanAttemptSend(status: CandidateSendContext["candidate"]["status"]) {
  if (status === "pending_review" || status === "send_failed" || status === "approved") {
    return;
  }

  throw new Error(`Candidate is not sendable from status: ${status}`);
}

async function loadCandidateSendContext(args: {
  accountId: string;
  candidateId: string;
}) {
  const client = getConvexServerClient();
  const context = (await client.query(
    "reviews:getCandidateSendContext" as never,
    {
      accountId: args.accountId,
      candidateId: args.candidateId
    } as never
  )) as CandidateSendContext | null;

  if (!context) {
    throw new Error("Candidate send context not found");
  }

  if (!context.socialAccount?.accessTokenRef) {
    throw new Error("Social account credentials are not connected");
  }

  return context;
}

async function postReplyToPlatform(args: {
  context: CandidateSendContext;
  replyText: string;
}) {
  const accessToken = unsealToken(args.context.socialAccount!.accessTokenRef);
  return sendPlatformReply({
    platform: args.context.comment.platform,
    accessToken,
    platformCommentId: args.context.comment.platformCommentId,
    platformPostId: args.context.comment.platformPostId,
    messageId: args.context.candidate.messageId ?? args.context.comment.messageId,
    replyText: args.replyText
  });
}

async function resolvePlatformSendForCandidate(args: {
  accountId: string;
  candidateId: string;
  ownerUserId: string;
  replyText: string;
  sentBy: "owner" | "owner_edited";
  context: CandidateSendContext;
}) {
  const client = getConvexServerClient();
  const normalizedReplyText = normalizeReplyText(args.replyText);
  const textHash = hashReplyText(normalizedReplyText);
  const telemetryBase = {
    accountId: args.accountId,
    candidateId: args.candidateId,
    sentBy: args.sentBy,
    textHash
  };

  const existingReceipt = (await client.query(
    "reviews:getPlatformSendReceipt" as never,
    {
      accountId: args.accountId,
      candidateId: args.candidateId,
      textHash,
      sentText: normalizedReplyText
    } as never
  )) as { platformReplyId?: string } | null;

  if (existingReceipt) {
    logInboxSendInfo("dedupe_hit", {
      ...telemetryBase,
      hasPlatformReplyId: Boolean(existingReceipt.platformReplyId)
    });
    return {
      platformReplyId: existingReceipt.platformReplyId
    };
  }

  logInboxSendInfo("dedupe_miss", telemetryBase);

  const platformSend = await postReplyToPlatform({
    context: args.context,
    replyText: args.replyText
  });
  logInboxSendInfo("provider_send_succeeded", {
    ...telemetryBase,
    hasPlatformReplyId: Boolean(platformSend.platformReplyId)
  });

  try {
    await client.mutation(
      "reviews:recordPlatformSendReceipt" as never,
      {
        accountId: args.accountId,
        candidateId: args.candidateId,
        textHash,
        sentText: normalizedReplyText,
        sentBy: args.sentBy,
        platformReplyId: platformSend.platformReplyId
      } as never
    );
    logInboxSendInfo("receipt_write_succeeded", telemetryBase);
  } catch (error) {
    // Continue with send finalization; retries can still dedupe via repliesSent fallback.
    const receiptWriteErrorMessage =
      error instanceof Error ? error.message : "unknown_receipt_write_error";
    logInboxSendWarn("receipt_write_failed", {
      ...telemetryBase,
      errorMessage: receiptWriteErrorMessage
    });
    let fallbackReplySentWriteFailed = false;
    try {
      await client.mutation(
        "reviews:recordProviderSendFallbackReplySent" as never,
        {
          accountId: args.accountId,
          candidateId: args.candidateId,
          sentText: normalizedReplyText,
          sentBy: args.sentBy,
          platformReplyId: platformSend.platformReplyId
        } as never
      );
      logInboxSendInfo("fallback_reply_sent_write_succeeded", telemetryBase);
    } catch (fallbackError) {
      fallbackReplySentWriteFailed = true;
      logInboxSendWarn("fallback_reply_sent_write_failed", {
        ...telemetryBase,
        errorMessage:
          fallbackError instanceof Error
            ? fallbackError.message
            : "unknown_fallback_reply_sent_write_error"
      });
    }

    try {
      await client.mutation(
        "reviews:logPlatformSendReceiptWriteFailure" as never,
        {
          accountId: args.accountId,
          candidateId: args.candidateId,
          ownerUserId: args.ownerUserId,
          textHash,
          sentText: normalizedReplyText,
          errorMessage: fallbackReplySentWriteFailed
            ? `${receiptWriteErrorMessage}; fallback_reply_sent_write_failed`
            : receiptWriteErrorMessage
        } as never
      );
      logInboxSendInfo("receipt_write_failure_audited", telemetryBase);
    } catch {
      logInboxSendWarn("receipt_write_failure_audit_failed", telemetryBase);
    }
  }

  return platformSend;
}

async function markSendFailed(args: { candidateId: string; commentId: string }) {
  const client = getConvexServerClient();
  await Promise.all([
    client.mutation(
      "drafts:updateCandidateStatus" as never,
      {
        candidateId: args.candidateId,
        status: "send_failed"
      } as never
    ),
    client.mutation(
      "comments:updateCommentStatus" as never,
      {
        commentId: args.commentId,
        status: "send_failed"
      } as never
    )
  ]);
}

export async function approveCandidateAction(formData: FormData) {
  const accountId = getRequiredValue(formData, "accountId");
  const cursor = getOptionalValue(formData, "cursor");
  const history = getOptionalValue(formData, "history");
  const platform = getOptionalValue(formData, "platform");
  const intent = getOptionalValue(formData, "intent");
  const ageBand = getOptionalValue(formData, "ageBand");
  const q = getOptionalValue(formData, "q");
  let result: string | undefined;
  let errorMessage: string | undefined;
  let context: CandidateSendContext | undefined;
  let candidateId: string | undefined;
  let shouldMarkSendFailed = false;
  let sendFinalized = false;

  try {
    candidateId = getRequiredValue(formData, "candidateId");
    const ownerUserId = getRequiredValue(formData, "ownerUserId");

    context = await loadCandidateSendContext({
      accountId,
      candidateId
    });
    if (isCandidateAlreadySent(context.candidate.status)) {
      await finalizeAlreadySentCandidate({
        context,
        candidateId,
        ownerUserId
      });
      logInboxSendInfo("already_sent_noop", {
        accountId,
        candidateId,
        status: context.candidate.status,
        action: "approve"
      });
      result = context.candidate.status === "edited_and_sent" ? "edited_and_sent" : "approved";
    } else {
      assertCandidateCanAttemptSend(context.candidate.status);
      shouldMarkSendFailed = true;

      const platformSend = await resolvePlatformSendForCandidate({
        accountId,
        candidateId,
        ownerUserId,
        sentBy: "owner",
        context,
        replyText: context.candidate.text
      });

      const client = getConvexServerClient();
      await client.mutation(
        "reviews:approveAndSendCandidate" as never,
        {
          candidateId,
          ownerUserId,
          platformReplyId: platformSend.platformReplyId
        } as never
      );
      sendFinalized = true;

      await runPostSendLike(candidateId);
      await cleanupResolvedMessageData({
        candidateId,
        ownerUserId,
        resolution: "sent"
      });
      result = "approved";
    }
  } catch (error) {
    if (shouldMarkSendFailed && context && candidateId && !sendFinalized) {
      try {
        await markSendFailed({
          candidateId,
          commentId: context.comment._id
        });
      } catch {
        // Best effort: keep the original send error surfaced to the UI.
      }
    }

    errorMessage =
      error instanceof Error ? error.message : "Failed to approve candidate";
  }

  redirect(
    buildInboxRedirectUrl({
      accountId,
      cursor,
      history,
      platform,
      intent,
      ageBand,
      q,
      result,
      error: errorMessage
    })
  );
}

export async function sendCandidateAction(formData: FormData) {
  const accountId = getRequiredValue(formData, "accountId");
  const cursor = getOptionalValue(formData, "cursor");
  const history = getOptionalValue(formData, "history");
  const platform = getOptionalValue(formData, "platform");
  const intent = getOptionalValue(formData, "intent");
  const ageBand = getOptionalValue(formData, "ageBand");
  const q = getOptionalValue(formData, "q");
  let result: string | undefined;
  let errorMessage: string | undefined;
  let context: CandidateSendContext | undefined;
  let candidateId: string | undefined;
  let shouldMarkSendFailed = false;
  let sendFinalized = false;

  try {
    candidateId = getRequiredValue(formData, "candidateId");
    const ownerUserId = getRequiredValue(formData, "ownerUserId");
    const editedText = getRequiredValue(formData, "editedText");
    const originalText = getRequiredValue(formData, "originalText");
    const finalReplyText =
      editedText.trim() === originalText.trim() ? originalText : editedText;
    const sentBy = editedText.trim() === originalText.trim() ? "owner" : "owner_edited";

    context = await loadCandidateSendContext({
      accountId,
      candidateId
    });
    if (isCandidateAlreadySent(context.candidate.status)) {
      await finalizeAlreadySentCandidate({
        context,
        candidateId,
        ownerUserId
      });
      logInboxSendInfo("already_sent_noop", {
        accountId,
        candidateId,
        status: context.candidate.status,
        action: "send"
      });
      result =
        context.candidate.status === "edited_and_sent"
          ? "edited_and_sent"
          : "approved_and_sent";
    } else {
      assertCandidateCanAttemptSend(context.candidate.status);
      shouldMarkSendFailed = true;

      const platformSend = await resolvePlatformSendForCandidate({
        accountId,
        candidateId,
        ownerUserId,
        sentBy,
        context,
        replyText: finalReplyText
      });

      const client = getConvexServerClient();

      if (editedText.trim() === originalText.trim()) {
        await client.mutation(
          "reviews:approveAndSendCandidate" as never,
          {
            candidateId,
            ownerUserId,
            platformReplyId: platformSend.platformReplyId
          } as never
        );
        sendFinalized = true;
        result = "approved_and_sent";
      } else {
        await client.mutation(
          "reviews:editAndSendCandidate" as never,
          {
            candidateId,
            ownerUserId,
            editedText,
            platformReplyId: platformSend.platformReplyId
          } as never
        );
        sendFinalized = true;
        result = "edited_and_sent";
      }

      await runPostSendLike(candidateId);
      await cleanupResolvedMessageData({
        candidateId,
        ownerUserId,
        resolution: sentBy === "owner_edited" ? "edited_and_sent" : "sent"
      });
    }
  } catch (error) {
    if (shouldMarkSendFailed && context && candidateId && !sendFinalized) {
      try {
        await markSendFailed({
          candidateId,
          commentId: context.comment._id
        });
      } catch {
        // Best effort: keep the original send error surfaced to the UI.
      }
    }

    errorMessage = error instanceof Error ? error.message : "Failed to send candidate";
  }

  redirect(
    buildInboxRedirectUrl({
      accountId,
      cursor,
      history,
      platform,
      intent,
      ageBand,
      q,
      result,
      error: errorMessage
    })
  );
}

export async function rejectCandidateAction(formData: FormData) {
  const accountId = getRequiredValue(formData, "accountId");
  const cursor = getOptionalValue(formData, "cursor");
  const history = getOptionalValue(formData, "history");
  const platform = getOptionalValue(formData, "platform");
  const intent = getOptionalValue(formData, "intent");
  const ageBand = getOptionalValue(formData, "ageBand");
  const q = getOptionalValue(formData, "q");
  let result: string | undefined;
  let errorMessage: string | undefined;

  try {
    const candidateId = getRequiredValue(formData, "candidateId");
    const ownerUserId = getRequiredValue(formData, "ownerUserId");

    const client = getConvexServerClient();
    await client.mutation(
      "reviews:rejectCandidate" as never,
      {
        candidateId,
        ownerUserId
      } as never
    );
    result = "rejected";
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Failed to reject candidate";
  }

  redirect(
    buildInboxRedirectUrl({
      accountId,
      cursor,
      history,
      platform,
      intent,
      ageBand,
      q,
      result,
      error: errorMessage
    })
  );
}
