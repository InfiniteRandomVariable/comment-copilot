import { query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";
import {
  buildUsageDashboardMetrics,
  clampWindowDays,
  utcMonthKey
} from "./lib/usageDashboard";

export const getUsageDashboard = query({
  args: {
    accountId: v.id("accounts"),
    windowDays: v.optional(v.number()),
    monthKey: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = nowTs();
    const windowDays = clampWindowDays(args.windowDays);
    const monthKey = args.monthKey ?? utcMonthKey(now);

    const [pendingTasks, sends, failedCandidates, monthlyUsage, tokenUsageEvents] =
      await Promise.all([
        ctx.db
          .query("approvalTasks")
          .withIndex("by_account_status", (q) =>
            q.eq("accountId", args.accountId).eq("status", "pending")
          )
          .collect(),
        ctx.db
          .query("repliesSent")
          .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
          .collect(),
        ctx.db
          .query("replyCandidates")
          .withIndex("by_account_status_created", (q) =>
            q.eq("accountId", args.accountId).eq("status", "send_failed")
          )
          .collect(),
        ctx.db
          .query("monthlyTokenUsage")
          .withIndex("by_account_month", (q) =>
            q.eq("accountId", args.accountId).eq("monthKey", monthKey)
          )
          .unique(),
        ctx.db
          .query("tokenUsageEvents")
          .withIndex("by_account_month", (q) =>
            q.eq("accountId", args.accountId).eq("monthKey", monthKey)
          )
          .collect()
      ]);

    return buildUsageDashboardMetrics({
      nowTs: now,
      windowDays,
      monthKey,
      pendingTaskCreationTimes: pendingTasks.map((task) => task._creationTime),
      sends: sends.map((send) => ({
        sentAt: send.sentAt,
        sentBy: send.sentBy
      })),
      failedCandidates: failedCandidates.map((candidate) => ({
        sendAttemptedAt: candidate.sendAttemptedAt,
        reviewedAt: candidate.reviewedAt,
        createdAt: candidate.createdAt
      })),
      tokenUsageEvents: tokenUsageEvents.map((event) => ({
        createdAt: event.createdAt,
        eventType: event.eventType,
        totalTokens: event.totalTokens
      })),
      monthlyUsage: monthlyUsage
        ? {
            usedTokens: monthlyUsage.usedTokens,
            includedTokens: monthlyUsage.includedTokens
          }
        : undefined
    });
  }
});
