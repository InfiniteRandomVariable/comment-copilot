import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

const FREE_TIER_TOKEN_LIMIT = 10_000;
const WARNING_TOKEN_THRESHOLD = 8_000;
const OVERAGE_CHUNK_SIZE = 50_000;
const OVERAGE_CHUNK_PRICE_CENTS = 199;

function utcMonthKey(ts: number) {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

async function ensureBillingAccount(ctx: any, accountId: string) {
  const existing = await ctx.db
    .query("billingAccounts")
    .withIndex("by_account", (q: any) => q.eq("accountId", accountId))
    .unique();

  if (existing) return existing;

  const ts = nowTs();
  const id = await ctx.db.insert("billingAccounts", {
    accountId,
    planType: "free",
    billingStatus: "active",
    createdAt: ts,
    updatedAt: ts
  });

  return ctx.db.get(id);
}

async function ensureMonthlyUsage(ctx: any, accountId: string, monthKey: string) {
  const existing = await ctx.db
    .query("monthlyTokenUsage")
    .withIndex("by_account_month", (q: any) =>
      q.eq("accountId", accountId).eq("monthKey", monthKey)
    )
    .unique();

  if (existing) return existing;

  const ts = nowTs();
  const id = await ctx.db.insert("monthlyTokenUsage", {
    accountId,
    monthKey,
    includedTokens: FREE_TIER_TOKEN_LIMIT,
    usedTokens: 0,
    createdAt: ts,
    updatedAt: ts
  });

  return ctx.db.get(id);
}

async function findBillingAccountByStripeRefs(
  ctx: any,
  args: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  }
) {
  if (args.stripeSubscriptionId) {
    const bySubscription = await ctx.db
      .query("billingAccounts")
      .withIndex("by_stripe_subscription", (q: any) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique();
    if (bySubscription) return bySubscription;
  }

  if (args.stripeCustomerId) {
    const byCustomer = await ctx.db
      .query("billingAccounts")
      .withIndex("by_stripe_customer", (q: any) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .unique();
    if (byCustomer) return byCustomer;
  }

  return null;
}

async function enqueueNotificationIfMissing(
  ctx: any,
  args: {
    accountId: string;
    monthKey: string;
    eventType:
      | "token_warning_threshold"
      | "token_free_tier_cap_reached";
    payload: Record<string, unknown>;
  }
) {
  const existing = await ctx.db
    .query("notificationEvents")
    .withIndex("by_account_month", (q: any) =>
      q.eq("accountId", args.accountId).eq("monthKey", args.monthKey)
    )
    .filter((q: any) => q.eq(q.field("eventType"), args.eventType))
    .first();

  if (existing) return existing._id;

  return ctx.db.insert("notificationEvents", {
    accountId: args.accountId,
    monthKey: args.monthKey,
    eventType: args.eventType,
    status: "pending",
    attempts: 0,
    payloadJson: JSON.stringify(args.payload),
    createdAt: nowTs(),
    updatedAt: nowTs()
  });
}

export const upsertBillingAccount = mutation({
  args: {
    accountId: v.id("accounts"),
    planType: v.union(v.literal("free"), v.literal("paid")),
    billingStatus: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled")
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingAccounts")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    const ts = nowTs();

    if (existing) {
      await ctx.db.patch(existing._id, {
        planType: args.planType,
        billingStatus: args.billingStatus,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        updatedAt: ts
      });
      return existing._id;
    }

    return ctx.db.insert("billingAccounts", {
      accountId: args.accountId,
      planType: args.planType,
      billingStatus: args.billingStatus,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      createdAt: ts,
      updatedAt: ts
    });
  }
});

export const processStripeBillingEvent = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    accountId: v.optional(v.id("accounts")),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    planType: v.union(v.literal("free"), v.literal("paid")),
    billingStatus: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled")
    ),
    payloadJson: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existingEvent) {
      return {
        deduped: true,
        status: "duplicate" as const,
        resolvedAccountId: existingEvent.accountId ?? null
      };
    }

    const ts = nowTs();
    let billing = null;

    if (args.accountId) {
      billing = await ctx.db
        .query("billingAccounts")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
        .unique();
    }

    if (!billing) {
      billing = await findBillingAccountByStripeRefs(ctx, {
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId
      });
    }

    if (!billing && !args.accountId) {
      await ctx.db.insert("stripeWebhookEvents", {
        eventId: args.eventId,
        eventType: args.eventType,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        status: "ignored_unresolved_account",
        payloadJson: args.payloadJson,
        processedAt: ts
      });

      return {
        deduped: false,
        status: "ignored_unresolved_account" as const,
        resolvedAccountId: null
      };
    }

    if (billing) {
      await ctx.db.patch(billing._id, {
        planType: args.planType,
        billingStatus: args.billingStatus,
        stripeCustomerId: args.stripeCustomerId ?? billing.stripeCustomerId,
        stripeSubscriptionId:
          args.stripeSubscriptionId ?? billing.stripeSubscriptionId,
        updatedAt: ts
      });
    } else {
      await ctx.db.insert("billingAccounts", {
        accountId: args.accountId!,
        planType: args.planType,
        billingStatus: args.billingStatus,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        createdAt: ts,
        updatedAt: ts
      });
    }

    const resolvedAccountId = billing?.accountId ?? args.accountId ?? null;

    await ctx.db.insert("stripeWebhookEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      accountId: resolvedAccountId ?? undefined,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      status: "processed",
      payloadJson: args.payloadJson,
      processedAt: ts
    });

    return {
      deduped: false,
      status: "processed" as const,
      resolvedAccountId
    };
  }
});

export const getUsageSummary = query({
  args: {
    accountId: v.id("accounts"),
    monthKey: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const monthKey = args.monthKey ?? utcMonthKey(nowTs());

    const [billing, usage] = await Promise.all([
      ctx.db
        .query("billingAccounts")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .unique(),
      ctx.db
        .query("monthlyTokenUsage")
        .withIndex("by_account_month", (q) =>
          q.eq("accountId", args.accountId).eq("monthKey", monthKey)
        )
        .unique()
    ]);

    const usedTokens = usage?.usedTokens ?? 0;
    const includedTokens = usage?.includedTokens ?? FREE_TIER_TOKEN_LIMIT;
    const overageTokens = Math.max(0, usedTokens - includedTokens);
    const overageChunks = Math.ceil(overageTokens / OVERAGE_CHUNK_SIZE);

    return {
      monthKey,
      billingPlan: billing?.planType ?? "free",
      billingStatus: billing?.billingStatus ?? "active",
      usedTokens,
      includedTokens,
      warningThreshold: WARNING_TOKEN_THRESHOLD,
      hardCap: FREE_TIER_TOKEN_LIMIT,
      overageTokens,
      estimatedOverageCents: overageChunks * OVERAGE_CHUNK_PRICE_CENTS
    };
  }
});

export const reserveTokensForGeneration = mutation({
  args: {
    accountId: v.id("accounts"),
    estimatedTokens: v.number(),
    commentId: v.optional(v.id("comments")),
    workflowId: v.optional(v.string()),
    model: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    if (args.estimatedTokens <= 0) {
      throw new Error("estimatedTokens must be greater than zero");
    }

    const ts = nowTs();
    const monthKey = utcMonthKey(ts);

    const billing = await ensureBillingAccount(ctx, args.accountId);
    const usage = await ensureMonthlyUsage(ctx, args.accountId, monthKey);

    const projectedUsage = usage.usedTokens + args.estimatedTokens;

    if (
      billing.planType === "free" &&
      billing.billingStatus === "active" &&
      projectedUsage > usage.includedTokens
    ) {
      await enqueueNotificationIfMissing(ctx, {
        accountId: args.accountId,
        monthKey,
        eventType: "token_free_tier_cap_reached",
        payload: {
          includedTokens: usage.includedTokens,
          usedTokens: usage.usedTokens,
          attemptedReserve: args.estimatedTokens
        }
      });
      throw new Error("FREE_TIER_TOKEN_CAP_REACHED");
    }

    let warningTriggered = false;
    if (
      usage.warningSentAt === undefined &&
      projectedUsage >= WARNING_TOKEN_THRESHOLD
    ) {
      warningTriggered = true;
      await enqueueNotificationIfMissing(ctx, {
        accountId: args.accountId,
        monthKey,
        eventType: "token_warning_threshold",
        payload: {
          warningThreshold: WARNING_TOKEN_THRESHOLD,
          projectedUsage
        }
      });
    }

    const capReached = projectedUsage >= usage.includedTokens;

    await ctx.db.patch(usage._id, {
      usedTokens: projectedUsage,
      warningSentAt: warningTriggered ? ts : usage.warningSentAt,
      capReachedAt: capReached ? ts : usage.capReachedAt,
      updatedAt: ts
    });

    const reservationId = await ctx.db.insert("tokenReservations", {
      accountId: args.accountId,
      monthKey,
      commentId: args.commentId,
      workflowId: args.workflowId,
      model: args.model,
      estimatedTokens: args.estimatedTokens,
      status: "reserved",
      createdAt: ts
    });

    await ctx.db.insert("tokenUsageEvents", {
      accountId: args.accountId,
      monthKey,
      reservationId,
      commentId: args.commentId,
      workflowId: args.workflowId,
      model: args.model,
      eventType: "reserve",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: args.estimatedTokens,
      createdAt: ts
    });

    return {
      reservationId,
      monthKey,
      usedTokensAfterReserve: projectedUsage,
      warningTriggered,
      capReached
    };
  }
});

export const finalizeTokenReservation = mutation({
  args: {
    reservationId: v.id("tokenReservations"),
    promptTokens: v.number(),
    completionTokens: v.number(),
    model: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    if (args.promptTokens < 0 || args.completionTokens < 0) {
      throw new Error("Token counts must be non-negative");
    }

    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) {
      throw new Error("Reservation not found");
    }

    if (reservation.status !== "reserved") {
      return {
        reservationId: args.reservationId,
        status: reservation.status
      };
    }

    const usage = await ctx.db
      .query("monthlyTokenUsage")
      .withIndex("by_account_month", (q) =>
        q.eq("accountId", reservation.accountId).eq("monthKey", reservation.monthKey)
      )
      .unique();

    if (!usage) {
      throw new Error("Monthly usage record missing for reservation");
    }

    const ts = nowTs();
    const actualTokens = args.promptTokens + args.completionTokens;
    const delta = actualTokens - reservation.estimatedTokens;
    const correctedUsage = Math.max(0, usage.usedTokens + delta);

    await ctx.db.patch(usage._id, {
      usedTokens: correctedUsage,
      capReachedAt:
        correctedUsage >= usage.includedTokens
          ? usage.capReachedAt ?? ts
          : usage.capReachedAt,
      updatedAt: ts
    });

    await ctx.db.patch(args.reservationId, {
      actualTokens,
      status: "finalized",
      finalizedAt: ts,
      model: args.model ?? reservation.model
    });

    await ctx.db.insert("tokenUsageEvents", {
      accountId: reservation.accountId,
      monthKey: reservation.monthKey,
      reservationId: args.reservationId,
      commentId: reservation.commentId,
      workflowId: reservation.workflowId,
      model: args.model ?? reservation.model,
      eventType: "finalize",
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      totalTokens: actualTokens,
      createdAt: ts
    });

    return {
      reservationId: args.reservationId,
      usedTokensAfterFinalize: correctedUsage,
      delta
    };
  }
});
