import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

export const getCommentContextByComment = query({
  args: {
    accountId: v.id("accounts"),
    commentId: v.id("comments")
  },
  handler: async (ctx, args) => {
    const context = await ctx.db
      .query("commentContexts")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .order("desc")
      .first();

    if (!context || context.accountId !== args.accountId) {
      return null;
    }

    return context;
  }
});

export const buildCommentContext = mutation({
  args: {
    accountId: v.id("accounts"),
    commentId: v.id("comments")
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.accountId !== args.accountId) {
      throw new Error("Comment not found for account");
    }

    const [account, persona, commenterProfile, commenterVideo, responseStyle, customStyle] =
      await Promise.all([
        ctx.db.get(args.accountId),
        ctx.db
          .query("personaProfiles")
          .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
          .unique(),
        ctx.db
          .query("commenterProfiles")
          .withIndex("by_account_commenter", (q) =>
            q
              .eq("accountId", args.accountId)
              .eq("commenterPlatformId", comment.commenterPlatformId)
          )
          .first(),
        ctx.db
          .query("commenterVideos")
          .withIndex("by_account_commenter", (q) =>
            q
              .eq("accountId", args.accountId)
              .eq("commenterPlatformId", comment.commenterPlatformId)
          )
          .order("desc")
          .first(),
        ctx.db
          .query("responseStyleSkillVersions")
          .withIndex("by_account_status", (q) =>
            q.eq("accountId", args.accountId).eq("status", "active")
          )
          .unique(),
        ctx.db
          .query("customResponseStyleSkillVersions")
          .withIndex("by_account_status", (q) =>
            q.eq("accountId", args.accountId).eq("status", "active")
          )
          .unique()
      ]);

    const missingContextFields: string[] = [];
    if (!commenterProfile) missingContextFields.push("commenterProfileSummary");
    if (!commenterVideo && !comment.commenterLatestVideoId) {
      missingContextFields.push("commenterLatestVideoSummary");
    }
    if (!comment.sourceVideoTitle) missingContextFields.push("sourceVideoTitle");
    if (!responseStyle) missingContextFields.push("responseStyleSkill");

    const payload = {
      commentId: comment._id,
      messageId: comment.messageId ?? comment.platformCommentId,
      commentText: comment.text,
      sourceVideoId: comment.platformPostId,
      sourceVideoTitle: comment.sourceVideoTitle ?? "",
      creatorAccountId: args.accountId,
      creatorThemeSummary: [
        account?.displayName ? `account:${account.displayName}` : null,
        persona?.personalityStyle ? `style:${persona.personalityStyle}` : null,
        persona?.expertiseTags?.length
          ? `expertise:${persona.expertiseTags.join(", ")}`
          : null
      ]
        .filter(Boolean)
        .join(" | "),
      commenterProfileSummary: commenterProfile
        ? {
            username: commenterProfile.username,
            bio: commenterProfile.bio,
            recentTitles: commenterProfile.recentTitles
          }
        : null,
      commenterLatestVideoSummary: commenterVideo
        ? {
            platformVideoId: commenterVideo.platformVideoId,
            title: commenterVideo.title,
            description: commenterVideo.description
          }
        : comment.commenterLatestVideoId
          ? {
              platformVideoId: comment.commenterLatestVideoId,
              title: comment.commenterLatestVideoTitle ?? "",
              description: ""
            }
          : null,
      responseStyleSkillVersionId: responseStyle?._id,
      customResponseStyleSkillVersionId: customStyle?._id,
      responseStyleMarkdown: responseStyle?.markdown ?? "",
      customStyleMarkdown: customStyle?.markdown ?? ""
    };

    const ts = nowTs();
    const existing = await ctx.db
      .query("commentContexts")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .first();

    const contextCompleteness =
      missingContextFields.length === 0 ? "complete" : "partial";

    if (existing) {
      await ctx.db.patch(existing._id, {
        contextCompleteness,
        missingContextFields,
        payloadJson: JSON.stringify(payload),
        updatedAt: ts
      });
    } else {
      await ctx.db.insert("commentContexts", {
        accountId: args.accountId,
        commentId: args.commentId,
        contextCompleteness,
        missingContextFields,
        payloadJson: JSON.stringify(payload),
        createdAt: ts,
        updatedAt: ts
      });
    }

    await ctx.db.patch(args.commentId, {
      status: "context_collected",
      updatedAt: ts
    });

    return {
      accountId: args.accountId,
      commentId: comment._id,
      messageId: payload.messageId,
      commentText: payload.commentText,
      sourceVideoTitle: payload.sourceVideoTitle,
      creatorThemeSummary: payload.creatorThemeSummary,
      commenterProfileSummary: payload.commenterProfileSummary,
      commenterLatestVideoSummary: payload.commenterLatestVideoSummary,
      responseStyleSkillVersionId: responseStyle?._id ?? null,
      customResponseStyleSkillVersionId: customStyle?._id ?? null,
      responseStyleMarkdown: payload.responseStyleMarkdown,
      customStyleMarkdown: payload.customStyleMarkdown,
      contextCompleteness,
      missingContextFields,
      contextSnapshotJson: JSON.stringify(payload)
    };
  }
});
