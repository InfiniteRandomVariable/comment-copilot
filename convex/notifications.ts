import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

function utcMonthKey(ts: number) {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export const listPendingNotificationEvents = query({
  args: {
    accountId: v.optional(v.id("accounts")),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 500);

    if (args.accountId) {
      return ctx.db
        .query("notificationEvents")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .order("asc")
        .take(limit);
    }

    return ctx.db
      .query("notificationEvents")
      .withIndex("by_status_created", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(limit);
  }
});

export const claimNextPendingNotification = mutation({
  args: {
    accountId: v.optional(v.id("accounts")),
    maxAttempts: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const maxAttempts = Math.max(1, Math.min(args.maxAttempts ?? 5, 10));

    const next = args.accountId
      ? await ctx.db
          .query("notificationEvents")
          .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
          .filter((q) => q.eq(q.field("status"), "pending"))
          .order("asc")
          .first()
      : await ctx.db
          .query("notificationEvents")
          .withIndex("by_status_created", (q) => q.eq("status", "pending"))
          .order("asc")
          .first();

    if (!next) {
      return null;
    }

    if (next.attempts >= maxAttempts) {
      await ctx.db.patch(next._id, {
        status: "failed",
        lastError: `Max attempts reached (${maxAttempts})`,
        updatedAt: nowTs()
      });
      return null;
    }

    const account = await ctx.db.get(next.accountId);
    if (!account) {
      await ctx.db.patch(next._id, {
        status: "failed",
        lastError: "Account not found",
        updatedAt: nowTs()
      });
      return null;
    }

    const user = await ctx.db.get(account.ownerUserId);
    if (!user?.email) {
      await ctx.db.patch(next._id, {
        status: "failed",
        lastError: "Recipient email not found",
        updatedAt: nowTs()
      });
      return null;
    }

    const ts = nowTs();
    await ctx.db.patch(next._id, {
      status: "sending",
      attempts: next.attempts + 1,
      updatedAt: ts
    });

    return {
      notificationId: next._id,
      accountId: next.accountId,
      monthKey: next.monthKey,
      eventType: next.eventType,
      payloadJson: next.payloadJson,
      recipientEmail: user.email,
      recipientName: user.displayName
    };
  }
});

export const enqueueNotificationEvent = mutation({
  args: {
    accountId: v.id("accounts"),
    monthKey: v.string(),
    eventType: v.union(
      v.literal("token_warning_threshold"),
      v.literal("token_free_tier_cap_reached"),
      v.literal("token_40k_warning"),
      v.literal("token_50k_cap_reached")
    ),
    payloadJson: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const ts = nowTs();

    return ctx.db.insert("notificationEvents", {
      accountId: args.accountId,
      monthKey: args.monthKey,
      eventType: args.eventType,
      status: "pending",
      attempts: 0,
      payloadJson: args.payloadJson ?? "{}",
      createdAt: ts,
      updatedAt: ts
    });
  }
});

export const enqueueWebhookFailureAlert = mutation({
  args: {
    accountId: v.id("accounts"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok"), v.literal("stripe")),
    route: v.string(),
    error: v.string(),
    statusCode: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const ts = nowTs();
    const monthKey = utcMonthKey(ts);
    const payloadJson = JSON.stringify({
      platform: args.platform,
      route: args.route,
      error: args.error,
      statusCode: args.statusCode ?? 500,
      detectedAt: ts
    });

    return ctx.db.insert("notificationEvents", {
      accountId: args.accountId,
      monthKey,
      eventType: "webhook_processing_failed",
      status: "pending",
      attempts: 0,
      payloadJson,
      createdAt: ts,
      updatedAt: ts
    });
  }
});

export const markNotificationSent = mutation({
  args: {
    notificationId: v.id("notificationEvents")
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      status: "sent",
      sentAt: nowTs(),
      updatedAt: nowTs()
    });
  }
});

export const markNotificationFailed = mutation({
  args: {
    notificationId: v.id("notificationEvents"),
    error: v.string(),
    retry: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      status: args.retry ? "pending" : "failed",
      lastError: args.error,
      updatedAt: nowTs()
    });
  }
});
