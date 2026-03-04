import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  DEFAULT_AUTOPILOT_MAX_RISK,
  DEFAULT_AUTOPILOT_MIN_CONFIDENCE,
  nowTs
} from "./utils";

export const getAutopilotSettings = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("autopilotSettings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    if (settings) return settings;

    return {
      accountId: args.accountId,
      enabled: true,
      maxRiskScore: DEFAULT_AUTOPILOT_MAX_RISK,
      minConfidenceScore: DEFAULT_AUTOPILOT_MIN_CONFIDENCE,
      updatedAt: nowTs()
    };
  }
});

export const upsertAutopilotSettings = mutation({
  args: {
    accountId: v.id("accounts"),
    enabled: v.boolean(),
    maxRiskScore: v.number(),
    minConfidenceScore: v.number()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("autopilotSettings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    const ts = nowTs();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        maxRiskScore: args.maxRiskScore,
        minConfidenceScore: args.minConfidenceScore,
        updatedAt: ts
      });
      return existing._id;
    }

    return ctx.db.insert("autopilotSettings", {
      accountId: args.accountId,
      enabled: args.enabled,
      maxRiskScore: args.maxRiskScore,
      minConfidenceScore: args.minConfidenceScore,
      updatedAt: ts
    });
  }
});
