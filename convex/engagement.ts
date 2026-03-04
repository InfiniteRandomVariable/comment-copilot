import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

export const likeCommenterVideoIfAvailable = mutation({
  args: {
    candidateId: v.id("replyCandidates")
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
    const commenterVideoId = comment.commenterLatestVideoId;

    if (!commenterVideoId) {
      await ctx.db.insert("engagementActions", {
        accountId: candidate.accountId,
        commentId: candidate.commentId,
        candidateId: candidate._id,
        actionType: "like_commenter_video",
        status: "skipped",
        reason: "No commenter video available",
        payloadJson: JSON.stringify({ commenterVideoId: null }),
        createdAt: ts
      });

      await ctx.db.patch(comment._id, {
        status: "post_send_like_skipped",
        updatedAt: ts
      });

      return { status: "skipped" as const, reason: "No commenter video available" };
    }

    await ctx.db.insert("engagementActions", {
      accountId: candidate.accountId,
      commentId: candidate.commentId,
      candidateId: candidate._id,
      actionType: "like_commenter_video",
      status: "success",
      payloadJson: JSON.stringify({ commenterVideoId }),
      createdAt: ts
    });

    await ctx.db.patch(comment._id, {
      status: "post_send_like_done",
      updatedAt: ts
    });

    return { status: "success" as const, commenterVideoId };
  }
});
