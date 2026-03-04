import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

export const getByAccountId = query({
  args: {
    accountId: v.id("accounts")
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("socialAccounts")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();
  }
});

export const upsertCredentials = mutation({
  args: {
    accountId: v.id("accounts"),
    accessTokenRef: v.string(),
    refreshTokenRef: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();
    const ts = nowTs();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessTokenRef: args.accessTokenRef,
        refreshTokenRef: args.refreshTokenRef,
        tokenExpiresAt: args.tokenExpiresAt,
        scopes: args.scopes,
        updatedAt: ts
      });
      return existing._id;
    }

    return ctx.db.insert("socialAccounts", {
      accountId: args.accountId,
      accessTokenRef: args.accessTokenRef,
      refreshTokenRef: args.refreshTokenRef,
      tokenExpiresAt: args.tokenExpiresAt,
      scopes: args.scopes,
      createdAt: ts,
      updatedAt: ts
    });
  }
});

export const disconnectByAccountId = mutation({
  args: {
    accountId: v.id("accounts")
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    await ctx.db.patch(args.accountId, {
      isActive: false,
      updatedAt: nowTs()
    });

    return {
      accountId: args.accountId,
      credentialsRemoved: Boolean(existing),
      accountDeactivated: true
    };
  }
});
