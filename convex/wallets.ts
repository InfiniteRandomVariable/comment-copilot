import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

const DEFAULT_RECHARGE_THRESHOLD_CENTS = 200;
const DEFAULT_RECHARGE_AMOUNT_CENTS = 999;
const DEFAULT_PURCHASE_BLOCK_CENTS = 999;

function utcMonthKey(ts: number) {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

async function ensureWalletAccount(ctx: any, accountId: string) {
  const existing = await ctx.db
    .query("walletAccounts")
    .withIndex("by_account", (q: any) => q.eq("accountId", accountId))
    .unique();

  if (existing) return existing;

  const ts = nowTs();
  const id = await ctx.db.insert("walletAccounts", {
    accountId,
    currency: "usd",
    balanceCents: 0,
    autoRechargeEnabled: true,
    autoRechargeThresholdCents: DEFAULT_RECHARGE_THRESHOLD_CENTS,
    autoRechargeAmountCents: DEFAULT_RECHARGE_AMOUNT_CENTS,
    createdAt: ts,
    updatedAt: ts
  });

  return ctx.db.get(id);
}

export const getBalance = query({
  args: {
    accountId: v.id("accounts")
  },
  handler: async (ctx, args) => {
    const wallet = await ensureWalletAccount(ctx, args.accountId);

    const recentTransactions = await ctx.db
      .query("walletTransactions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(25);

    return {
      wallet,
      recentTransactions
    };
  }
});

export const purchaseCreditBlock = mutation({
  args: {
    accountId: v.id("accounts"),
    amountCents: v.optional(v.number()),
    referenceId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const amountCents = args.amountCents ?? DEFAULT_PURCHASE_BLOCK_CENTS;
    if (amountCents <= 0) {
      throw new Error("amountCents must be greater than zero");
    }

    const wallet = await ensureWalletAccount(ctx, args.accountId);
    if (!wallet) throw new Error("Wallet account unavailable");

    const ts = nowTs();
    const nextBalance = wallet.balanceCents + amountCents;

    await ctx.db.patch(wallet._id, {
      balanceCents: nextBalance,
      updatedAt: ts
    });

    const transactionId = await ctx.db.insert("walletTransactions", {
      accountId: args.accountId,
      walletAccountId: wallet._id,
      monthKey: utcMonthKey(ts),
      type: "credit_purchase",
      direction: "credit",
      amountCents,
      referenceId: args.referenceId,
      createdAt: ts
    });

    return {
      transactionId,
      balanceCents: nextBalance
    };
  }
});

export const recordUsageDebit = mutation({
  args: {
    accountId: v.id("accounts"),
    amountCents: v.number(),
    reason: v.optional(v.string()),
    referenceId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    if (args.amountCents <= 0) {
      throw new Error("amountCents must be greater than zero");
    }

    const wallet = await ensureWalletAccount(ctx, args.accountId);
    if (!wallet) throw new Error("Wallet account unavailable");

    if (wallet.balanceCents < args.amountCents) {
      throw new Error("Insufficient wallet balance");
    }

    const ts = nowTs();
    const nextBalance = wallet.balanceCents - args.amountCents;

    await ctx.db.patch(wallet._id, {
      balanceCents: nextBalance,
      updatedAt: ts
    });

    const transactionId = await ctx.db.insert("walletTransactions", {
      accountId: args.accountId,
      walletAccountId: wallet._id,
      monthKey: utcMonthKey(ts),
      type: "usage_debit",
      direction: "debit",
      amountCents: args.amountCents,
      referenceId: args.referenceId,
      reason: args.reason,
      createdAt: ts
    });

    return {
      transactionId,
      balanceCents: nextBalance
    };
  }
});

export const refundCredit = mutation({
  args: {
    accountId: v.id("accounts"),
    transactionId: v.id("walletTransactions"),
    reason: v.string(),
    operatorUserId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    const [wallet, original] = await Promise.all([
      ensureWalletAccount(ctx, args.accountId),
      ctx.db.get(args.transactionId)
    ]);

    if (!wallet) throw new Error("Wallet account unavailable");
    if (!original || original.accountId !== args.accountId) {
      throw new Error("Original wallet transaction not found for account");
    }

    const refundableCents = Math.min(wallet.balanceCents, original.amountCents);
    if (refundableCents <= 0) {
      throw new Error("No refundable balance available");
    }

    const ts = nowTs();
    const nextBalance = wallet.balanceCents - refundableCents;

    await ctx.db.patch(wallet._id, {
      balanceCents: nextBalance,
      updatedAt: ts
    });

    const refundTransactionId = await ctx.db.insert("walletTransactions", {
      accountId: args.accountId,
      walletAccountId: wallet._id,
      monthKey: utcMonthKey(ts),
      type: "refund",
      direction: "debit",
      amountCents: refundableCents,
      referenceId: `${args.transactionId}`,
      reason: args.reason,
      createdAt: ts
    });

    await ctx.db.insert("refundEvents", {
      accountId: args.accountId,
      walletTransactionId: refundTransactionId,
      reason: args.reason,
      amountCents: refundableCents,
      operatorUserId: args.operatorUserId,
      createdAt: ts
    });

    return {
      refundTransactionId,
      refundedCents: refundableCents,
      balanceCents: nextBalance
    };
  }
});

export const runAutoRechargeCheck = mutation({
  args: {
    accountId: v.id("accounts")
  },
  handler: async (ctx, args) => {
    const wallet = await ensureWalletAccount(ctx, args.accountId);
    if (!wallet) throw new Error("Wallet account unavailable");

    const setting = await ctx.db
      .query("autoRechargeSettings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    const enabled = setting?.enabled ?? wallet.autoRechargeEnabled;
    const thresholdCents =
      setting?.thresholdCents ?? wallet.autoRechargeThresholdCents;
    const rechargeAmountCents =
      setting?.rechargeAmountCents ?? wallet.autoRechargeAmountCents;

    if (!enabled || wallet.balanceCents > thresholdCents) {
      return {
        triggered: false,
        balanceCents: wallet.balanceCents
      };
    }

    const ts = nowTs();
    const nextBalance = wallet.balanceCents + rechargeAmountCents;

    await ctx.db.patch(wallet._id, {
      balanceCents: nextBalance,
      updatedAt: ts
    });

    const transactionId = await ctx.db.insert("walletTransactions", {
      accountId: args.accountId,
      walletAccountId: wallet._id,
      monthKey: utcMonthKey(ts),
      type: "auto_recharge",
      direction: "credit",
      amountCents: rechargeAmountCents,
      reason: "Auto recharge threshold reached",
      createdAt: ts
    });

    return {
      triggered: true,
      transactionId,
      balanceCents: nextBalance
    };
  }
});
