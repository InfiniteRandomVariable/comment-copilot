import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

export const listOwnerAccounts = query({
  args: { ownerUserId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", args.ownerUserId))
      .collect();
  }
});

export const getAccountById = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.accountId);
  }
});

export const upsertAccountFromOAuth = mutation({
  args: {
    ownerUserId: v.id("users"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    platformAccountId: v.string(),
    handle: v.string(),
    displayName: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_platform_account", (q) =>
        q.eq("platform", args.platform).eq("platformAccountId", args.platformAccountId)
      )
      .unique();

    const ts = nowTs();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ownerUserId: args.ownerUserId,
        handle: args.handle,
        displayName: args.displayName,
        isActive: true,
        updatedAt: ts
      });
      return existing._id;
    }

    return ctx.db.insert("accounts", {
      ownerUserId: args.ownerUserId,
      platform: args.platform,
      platformAccountId: args.platformAccountId,
      handle: args.handle,
      displayName: args.displayName,
      isActive: true,
      createdAt: ts,
      updatedAt: ts
    });
  }
});
