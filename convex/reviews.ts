import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";
import { cleanupMessageScopedData as performMessageCleanup } from "./lib/messageCleanup";

function normalizeReplyText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function getPendingTaskForCandidate(ctx: any, candidate: any) {
  return ctx.db
    .query("approvalTasks")
    .withIndex("by_comment", (q: any) => q.eq("commentId", candidate.commentId))
    .filter((q: any) => q.eq(q.field("candidateId"), candidate._id))
    .filter((q: any) => q.eq(q.field("status"), "pending"))
    .first();
}

async function getLatestReplySentForCandidate(ctx: any, candidateId: string) {
  return ctx.db
    .query("repliesSent")
    .withIndex("by_candidate", (q: any) => q.eq("candidateId", candidateId))
    .order("desc")
    .first();
}

async function writeAuditLog(ctx: any, args: {
  accountId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
}) {
  await ctx.db.insert("auditLogs", {
    accountId: args.accountId,
    actorType: "owner",
    actorId: args.actorUserId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    payloadJson: JSON.stringify(args.payload),
    createdAt: nowTs()
  });
}

async function cleanupMessageScopedData(
  ctx: any,
  args: {
    candidate: any;
    comment: any;
    ownerUserId: string;
    resolution: "sent" | "edited_and_sent" | "rejected";
  }
) {
  const cleanupResult = await performMessageCleanup(ctx, {
    candidate: args.candidate,
    comment: args.comment
  });

  await writeAuditLog(ctx, {
    accountId: args.candidate.accountId,
    actorUserId: args.ownerUserId,
    action: "reviews.cleanupResolvedMessageData",
    targetType: "messageLifecycle",
    targetId: `${args.candidate._id}`,
    payload: {
      resolution: args.resolution,
      candidateId: args.candidate._id,
      commentId: cleanupResult.commentId,
      messageId: cleanupResult.messageId,
      deletedCounts: cleanupResult.deletedCounts,
      redactedCounts: cleanupResult.redactedCounts
    }
  });

  return {
    ok: true as const,
    resolution: args.resolution,
    ...cleanupResult
  };
}

export const listPendingCandidates = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
    beforeCreationTime: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));

    const baseQuery = ctx.db
      .query("approvalTasks")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", args.accountId).eq("status", "pending")
      )
      .order("desc");

    const scopedQuery =
      typeof args.beforeCreationTime === "number"
        ? baseQuery.filter((q) =>
            q.lt(q.field("_creationTime"), args.beforeCreationTime!)
          )
        : baseQuery;

    const pendingTasks = await scopedQuery.take(limit);

    const items = await Promise.all(
      pendingTasks.map(async (task) => {
        const [candidate, comment] = await Promise.all([
          ctx.db.get(task.candidateId),
          ctx.db.get(task.commentId)
        ]);

        return {
          task,
          candidate,
          comment
        };
      })
    );

    return items.filter((item) => Boolean(item.candidate) && Boolean(item.comment));
  }
});

export const getCandidateSendContext = query({
  args: {
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates")
  },
  handler: async (ctx, args) => {
    const [account, candidate, socialAccount] = await Promise.all([
      ctx.db.get(args.accountId),
      ctx.db.get(args.candidateId),
      ctx.db
        .query("socialAccounts")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .unique()
    ]);

    if (!account || !candidate || candidate.accountId !== args.accountId) {
      return null;
    }

    const comment = await ctx.db.get(candidate.commentId);
    if (!comment || comment.accountId !== args.accountId) {
      return null;
    }

    return {
      account: {
        _id: account._id,
        platform: account.platform,
        platformAccountId: account.platformAccountId
      },
      comment: {
        _id: comment._id,
        platform: comment.platform,
        platformCommentId: comment.platformCommentId,
        platformPostId: comment.platformPostId,
        messageId: comment.messageId,
        status: comment.status
      },
      candidate: {
        _id: candidate._id,
        commentId: candidate.commentId,
        messageId: candidate.messageId,
        text: candidate.text,
        status: candidate.status
      },
      socialAccount: socialAccount
        ? {
            accessTokenRef: socialAccount.accessTokenRef
          }
        : null
    };
  }
});

export const getPlatformSendReceipt = query({
  args: {
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates"),
    textHash: v.string(),
    sentText: v.string()
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.accountId !== args.accountId) {
      return null;
    }
    const normalizedSentText = normalizeReplyText(args.sentText);

    const receipt = await ctx.db
      .query("platformSendReceipts")
      .withIndex("by_candidate_text_hash_created", (q) =>
        q.eq("candidateId", args.candidateId).eq("textHash", args.textHash)
      )
      .order("desc")
      .first();

    if (receipt) {
      return {
        platformReplyId: receipt.platformReplyId
      };
    }

    const repliesForCandidate = await ctx.db
      .query("repliesSent")
      .withIndex("by_candidate", (q) => q.eq("candidateId", args.candidateId))
      .order("desc")
      .collect();

    const existingReplySent = repliesForCandidate.find((reply) => {
      if (!reply.sentText) {
        return false;
      }
      return normalizeReplyText(reply.sentText) === normalizedSentText;
    });

    if (!existingReplySent) {
      return null;
    }

    return {
      platformReplyId: existingReplySent.platformReplyId
    };
  }
});

export const recordPlatformSendReceipt = mutation({
  args: {
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates"),
    textHash: v.string(),
    sentText: v.string(),
    sentBy: v.union(v.literal("owner"), v.literal("owner_edited")),
    platformReplyId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.accountId !== args.accountId) {
      throw new Error("Candidate not found for account");
    }

    const comment = await ctx.db.get(candidate.commentId);
    if (!comment || comment.accountId !== args.accountId) {
      throw new Error("Comment not found for account");
    }

    const normalizedSentText = normalizeReplyText(args.sentText);

    const existing = await ctx.db
      .query("platformSendReceipts")
      .withIndex("by_candidate_text_hash_created", (q) =>
        q.eq("candidateId", args.candidateId).eq("textHash", args.textHash)
      )
      .order("desc")
      .first();

    if (existing) {
      return {
        receiptId: existing._id,
        platformReplyId: existing.platformReplyId
      };
    }

    const receiptId = await ctx.db.insert("platformSendReceipts", {
      accountId: args.accountId,
      commentId: comment._id,
      candidateId: args.candidateId,
      textHash: args.textHash,
      sentText: normalizedSentText,
      platformReplyId: args.platformReplyId,
      sentBy: args.sentBy,
      sentAt: nowTs(),
      createdAt: nowTs()
    });

    return {
      receiptId,
      platformReplyId: args.platformReplyId
    };
  }
});

export const logPlatformSendReceiptWriteFailure = mutation({
  args: {
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates"),
    ownerUserId: v.id("users"),
    textHash: v.string(),
    sentText: v.string(),
    errorMessage: v.string()
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.accountId !== args.accountId) {
      throw new Error("Candidate not found for account");
    }

    await writeAuditLog(ctx, {
      accountId: args.accountId,
      actorUserId: args.ownerUserId,
      action: "reviews.recordPlatformSendReceipt.failed",
      targetType: "replyCandidate",
      targetId: `${args.candidateId}`,
      payload: {
        commentId: candidate.commentId,
        textHash: args.textHash,
        sentTextLength: args.sentText.length,
        errorMessage: args.errorMessage
      }
    });

    return { ok: true as const };
  }
});

export const recordProviderSendFallbackReplySent = mutation({
  args: {
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates"),
    sentText: v.string(),
    sentBy: v.union(v.literal("owner"), v.literal("owner_edited")),
    platformReplyId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.accountId !== args.accountId) {
      throw new Error("Candidate not found for account");
    }

    const comment = await ctx.db.get(candidate.commentId);
    if (!comment || comment.accountId !== args.accountId) {
      throw new Error("Comment not found for account");
    }

    const normalizedSentText = normalizeReplyText(args.sentText);

    const ts = nowTs();
    const existingReplySent = await getLatestReplySentForCandidate(ctx, args.candidateId);

    if (existingReplySent) {
      await ctx.db.patch(existingReplySent._id, {
        messageId: candidate.messageId ?? existingReplySent.messageId,
        sentText: normalizedSentText,
        platformReplyId: args.platformReplyId ?? existingReplySent.platformReplyId,
        sentBy: args.sentBy,
        sentAt: existingReplySent.sentAt ?? ts
      });
      return { replySentId: existingReplySent._id };
    }

    const replySentId = await ctx.db.insert("repliesSent", {
      accountId: candidate.accountId,
      commentId: candidate.commentId,
      candidateId: candidate._id,
      messageId: candidate.messageId,
      sentText: normalizedSentText,
      platformReplyId: args.platformReplyId,
      sentBy: args.sentBy,
      sentAt: ts
    });

    return { replySentId };
  }
});

export const approveAndSendCandidate = mutation({
  args: {
    candidateId: v.id("replyCandidates"),
    ownerUserId: v.id("users"),
    platformReplyId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    const comment = await ctx.db.get(candidate.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    const ts = nowTs();

    const normalizedCandidateText = normalizeReplyText(candidate.text);

    await ctx.db.patch(args.candidateId, {
      status: "sent",
      reviewedAt: ts,
      reviewedByUserId: args.ownerUserId,
      sendAttemptedAt: ts,
      lastError: undefined
    });

    const pendingTask = await getPendingTaskForCandidate(ctx, candidate);
    if (pendingTask) {
      await ctx.db.patch(pendingTask._id, {
        status: "approved",
        resolvedAt: ts,
        resolvedByUserId: args.ownerUserId
      });
    }

    const existingReplySent = await getLatestReplySentForCandidate(ctx, candidate._id);
    if (existingReplySent) {
      await ctx.db.patch(existingReplySent._id, {
        messageId: candidate.messageId ?? existingReplySent.messageId,
        sentText: normalizedCandidateText,
        platformReplyId: args.platformReplyId ?? existingReplySent.platformReplyId,
        sentBy: "owner",
        sentAt: existingReplySent.sentAt ?? ts
      });
    } else {
      await ctx.db.insert("repliesSent", {
        accountId: candidate.accountId,
        commentId: candidate.commentId,
        candidateId: candidate._id,
        messageId: candidate.messageId,
        sentText: normalizedCandidateText,
        platformReplyId: args.platformReplyId,
        sentBy: "owner",
        sentAt: ts
      });
    }

    await ctx.db.patch(comment._id, {
      status: "sent",
      updatedAt: ts
    });

    await writeAuditLog(ctx, {
      accountId: candidate.accountId,
      actorUserId: args.ownerUserId,
      action: "reviews.approveAndSendCandidate",
      targetType: "replyCandidate",
      targetId: `${candidate._id}`,
      payload: {
        commentId: candidate.commentId,
        messageId: candidate.messageId
      }
    });

    return {
      candidateId: candidate._id,
      commentId: candidate.commentId,
      status: "sent" as const
    };
  }
});

export const editAndSendCandidate = mutation({
  args: {
    candidateId: v.id("replyCandidates"),
    ownerUserId: v.id("users"),
    editedText: v.string(),
    platformReplyId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    const comment = await ctx.db.get(candidate.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    const ts = nowTs();

    const normalizedEditedText = normalizeReplyText(args.editedText);

    await ctx.db.patch(args.candidateId, {
      editedText: args.editedText,
      status: "sent",
      reviewedAt: ts,
      reviewedByUserId: args.ownerUserId,
      sendAttemptedAt: ts,
      lastError: undefined
    });

    const pendingTask = await getPendingTaskForCandidate(ctx, candidate);
    if (pendingTask) {
      await ctx.db.patch(pendingTask._id, {
        status: "approved",
        resolvedAt: ts,
        resolvedByUserId: args.ownerUserId
      });
    }

    const existingReplySent = await getLatestReplySentForCandidate(ctx, candidate._id);
    if (existingReplySent) {
      await ctx.db.patch(existingReplySent._id, {
        messageId: candidate.messageId ?? existingReplySent.messageId,
        sentText: normalizedEditedText,
        platformReplyId: args.platformReplyId ?? existingReplySent.platformReplyId,
        sentBy: "owner_edited",
        sentAt: existingReplySent.sentAt ?? ts
      });
    } else {
      await ctx.db.insert("repliesSent", {
        accountId: candidate.accountId,
        commentId: candidate.commentId,
        candidateId: candidate._id,
        messageId: candidate.messageId,
        sentText: normalizedEditedText,
        platformReplyId: args.platformReplyId,
        sentBy: "owner_edited",
        sentAt: ts
      });
    }

    await ctx.db.patch(comment._id, {
      status: "edited_and_sent",
      updatedAt: ts
    });

    await writeAuditLog(ctx, {
      accountId: candidate.accountId,
      actorUserId: args.ownerUserId,
      action: "reviews.editAndSendCandidate",
      targetType: "replyCandidate",
      targetId: `${candidate._id}`,
      payload: {
        commentId: candidate.commentId,
        messageId: candidate.messageId,
        editedTextLength: args.editedText.length
      }
    });

    return {
      candidateId: candidate._id,
      commentId: candidate.commentId,
      status: "edited_and_sent" as const
    };
  }
});

export const cleanupResolvedMessageData = mutation({
  args: {
    candidateId: v.id("replyCandidates"),
    ownerUserId: v.id("users"),
    resolution: v.optional(
      v.union(v.literal("sent"), v.literal("edited_and_sent"), v.literal("rejected"))
    )
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) {
      return {
        ok: true as const,
        skipped: true as const,
        reason: "candidate_not_found" as const
      };
    }

    const comment = await ctx.db.get(candidate.commentId);
    if (!comment) {
      return {
        ok: true as const,
        skipped: true as const,
        reason: "comment_not_found" as const
      };
    }

    const resolution =
      args.resolution ??
      (candidate.status === "rejected"
        ? "rejected"
        : candidate.status === "edited_and_sent"
          ? "edited_and_sent"
          : "sent");

    return cleanupMessageScopedData(ctx, {
      candidate,
      comment,
      ownerUserId: args.ownerUserId,
      resolution
    });
  }
});

export const rejectCandidate = mutation({
  args: {
    candidateId: v.id("replyCandidates"),
    ownerUserId: v.id("users"),
    reason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    const comment = await ctx.db.get(candidate.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    const ts = nowTs();

    await ctx.db.patch(args.candidateId, {
      status: "rejected",
      reviewedAt: ts,
      reviewedByUserId: args.ownerUserId,
      lastError: args.reason
    });

    const pendingTask = await getPendingTaskForCandidate(ctx, candidate);
    if (pendingTask) {
      await ctx.db.patch(pendingTask._id, {
        status: "rejected",
        resolvedAt: ts,
        resolvedByUserId: args.ownerUserId
      });
    }

    await ctx.db.patch(comment._id, {
      status: "rejected",
      updatedAt: ts
    });

    await writeAuditLog(ctx, {
      accountId: candidate.accountId,
      actorUserId: args.ownerUserId,
      action: "reviews.rejectCandidate",
      targetType: "replyCandidate",
      targetId: `${candidate._id}`,
      payload: {
        commentId: candidate.commentId,
        reason: args.reason
      }
    });

    const cleanupResult = await cleanupMessageScopedData(ctx, {
      candidate: { ...candidate, status: "rejected" },
      comment,
      ownerUserId: args.ownerUserId,
      resolution: "rejected"
    });

    return {
      ...cleanupResult,
      status: "rejected" as const
    };
  }
});
