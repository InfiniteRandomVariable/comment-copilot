import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";
import { intentLabelValidator } from "./intent";
import { createReplyCandidateWithRouting } from "./lib/draftCandidateRouting";

const candidateStatusValidator = v.union(
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("edited_and_sent"),
  v.literal("rejected"),
  v.literal("send_failed"),
  v.literal("sent")
);

export const createReplyCandidate = mutation({
  args: {
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    messageId: v.optional(v.string()),
    draftText: v.string(),
    intentLabel: intentLabelValidator,
    intentConfidence: v.number(),
    riskScore: v.optional(v.number()),
    riskLevel: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
    ),
    personalizationSignals: v.optional(v.array(v.string())),
    contextSnapshotJson: v.string(),
    responseStyleSkillVersionId: v.optional(v.id("responseStyleSkillVersions")),
    customResponseStyleSkillVersionId: v.optional(
      v.id("customResponseStyleSkillVersions")
    ),
    confidenceScore: v.optional(v.number()),
    rationale: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    return createReplyCandidateWithRouting(ctx, args, nowTs());
  }
});

export const listPendingCandidates = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));

    return ctx.db
      .query("replyCandidates")
      .withIndex("by_account_status_created", (q) =>
        q.eq("accountId", args.accountId).eq("status", "pending_review")
      )
      .order("desc")
      .take(limit);
  }
});

export const getCandidateById = query({
  args: {
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates")
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.accountId !== args.accountId) {
      return null;
    }

    return candidate;
  }
});

export const updateCandidateStatus = mutation({
  args: {
    candidateId: v.id("replyCandidates"),
    status: candidateStatusValidator,
    lastError: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.candidateId, {
      status: args.status,
      lastError: args.lastError
    });
  }
});
