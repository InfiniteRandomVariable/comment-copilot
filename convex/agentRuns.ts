import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

export const logAgentRunStage = mutation({
  args: {
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    workflowId: v.string(),
    runStatus: v.union(v.literal("started"), v.literal("completed"), v.literal("failed")),
    stage: v.union(
      v.literal("context"),
      v.literal("intent"),
      v.literal("generation"),
      v.literal("safety"),
      v.literal("routing"),
      v.literal("review"),
      v.literal("engagement")
    ),
    metadataJson: v.string()
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("agentRuns", {
      accountId: args.accountId,
      commentId: args.commentId,
      workflowId: args.workflowId,
      runStatus: args.runStatus,
      stage: args.stage,
      metadataJson: args.metadataJson,
      createdAt: nowTs()
    });
  }
});

export const listRecentRunsByStatus = query({
  args: {
    runStatus: v.union(v.literal("started"), v.literal("completed"), v.literal("failed")),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 10)));
    return ctx.db
      .query("agentRuns")
      .withIndex("by_status_created", (q) => q.eq("runStatus", args.runStatus))
      .order("desc")
      .take(limit);
  }
});
