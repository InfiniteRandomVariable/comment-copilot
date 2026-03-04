import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

const commentStatusValidator = v.union(
  v.literal("ingested"),
  v.literal("context_collected"),
  v.literal("intent_interpreted"),
  v.literal("draft_ready"),
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("edited_and_sent"),
  v.literal("rejected"),
  v.literal("sent"),
  v.literal("send_failed"),
  v.literal("post_send_like_done"),
  v.literal("post_send_like_skipped"),
  v.literal("pending"),
  v.literal("needs_review"),
  v.literal("auto_sent"),
  v.literal("ignored"),
  v.literal("reported")
);

export const ingestPlatformComment = mutation({
  args: {
    accountId: v.id("accounts"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    platformCommentId: v.string(),
    platformPostId: v.string(),
    commenterPlatformId: v.string(),
    text: v.string(),
    messageId: v.optional(v.string()),
    sourceVideoTitle: v.optional(v.string()),
    commenterUsername: v.optional(v.string()),
    commenterLatestVideoId: v.optional(v.string()),
    commenterLatestVideoTitle: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("comments")
      .withIndex("by_platform_comment", (q) =>
        q.eq("platform", args.platform).eq("platformCommentId", args.platformCommentId)
      )
      .unique();

    const ts = nowTs();
    if (existing) {
      await ctx.db.patch(existing._id, {
        text: args.text,
        messageId: args.messageId,
        sourceVideoTitle: args.sourceVideoTitle,
        commenterUsername: args.commenterUsername,
        commenterLatestVideoId: args.commenterLatestVideoId,
        commenterLatestVideoTitle: args.commenterLatestVideoTitle,
        updatedAt: ts
      });
      return { commentId: existing._id, created: false };
    }

    const commentId = await ctx.db.insert("comments", {
      accountId: args.accountId,
      platform: args.platform,
      platformCommentId: args.platformCommentId,
      platformPostId: args.platformPostId,
      commenterPlatformId: args.commenterPlatformId,
      text: args.text,
      messageId: args.messageId,
      sourceVideoTitle: args.sourceVideoTitle,
      commenterUsername: args.commenterUsername,
      commenterLatestVideoId: args.commenterLatestVideoId,
      commenterLatestVideoTitle: args.commenterLatestVideoTitle,
      status: "ingested",
      receivedAt: ts,
      updatedAt: ts
    });

    return { commentId, created: true };
  }
});

export const getCommentById = query({
  args: {
    accountId: v.id("accounts"),
    commentId: v.id("comments")
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.accountId !== args.accountId) {
      return null;
    }

    return comment;
  }
});

export const listInboxComments = query({
  args: {
    accountId: v.id("accounts"),
    status: v.optional(commentStatusValidator)
  },
  handler: async (ctx, args) => {
    if (!args.status) {
      return ctx.db
        .query("comments")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .order("desc")
        .take(200);
    }

    return ctx.db
      .query("comments")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", args.accountId).eq("status", args.status)
      )
      .order("desc")
      .take(200);
  }
});

export const updateCommentStatus = mutation({
  args: {
    commentId: v.id("comments"),
    status: commentStatusValidator
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.commentId, {
      status: args.status,
      updatedAt: nowTs()
    });
  }
});
