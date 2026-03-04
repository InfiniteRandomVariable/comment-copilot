import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

export const seedDefaultAccount = mutation({
  args: {
    clerkUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    platform: v.optional(v.union(v.literal("instagram"), v.literal("tiktok"))),
    platformAccountId: v.optional(v.string()),
    handle: v.optional(v.string()),
    accountDisplayName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const clerkUserId = args.clerkUserId ?? "dev_clerk_user";
    const email = args.email ?? "dev-owner@example.com";
    const displayName = args.displayName ?? "Dev Owner";
    const platform = args.platform ?? "instagram";
    const platformAccountId = args.platformAccountId ?? `dev-${platform}-acct-001`;
    const handle = args.handle ?? "devcreator";
    const accountDisplayName = args.accountDisplayName ?? "Dev Creator Account";

    const ts = nowTs();

    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    let userCreated = false;
    if (!user) {
      const userId = await ctx.db.insert("users", {
        clerkUserId,
        email,
        displayName,
        createdAt: ts
      });
      user = await ctx.db.get(userId);
      userCreated = true;
    }

    if (!user) {
      throw new Error("Failed to create or load user");
    }

    let account = await ctx.db
      .query("accounts")
      .withIndex("by_platform_account", (q) =>
        q.eq("platform", platform).eq("platformAccountId", platformAccountId)
      )
      .unique();

    let accountCreated = false;
    if (!account) {
      const accountId = await ctx.db.insert("accounts", {
        ownerUserId: user._id,
        platform,
        platformAccountId,
        handle,
        displayName: accountDisplayName,
        isActive: true,
        createdAt: ts,
        updatedAt: ts
      });
      account = await ctx.db.get(accountId);
      accountCreated = true;
    } else {
      await ctx.db.patch(account._id, {
        ownerUserId: user._id,
        handle,
        displayName: accountDisplayName,
        isActive: true,
        updatedAt: ts
      });
    }

    if (!account) {
      throw new Error("Failed to create or load account");
    }

    const billing = await ctx.db
      .query("billingAccounts")
      .withIndex("by_account", (q) => q.eq("accountId", account!._id))
      .unique();

    let billingCreated = false;
    if (!billing) {
      await ctx.db.insert("billingAccounts", {
        accountId: account._id,
        planType: "free",
        billingStatus: "active",
        createdAt: ts,
        updatedAt: ts
      });
      billingCreated = true;
    }

    return {
      userId: user._id,
      accountId: account._id,
      accountHandle: account.handle,
      created: {
        user: userCreated,
        account: accountCreated,
        billing: billingCreated
      }
    };
  }
});

export const getFirstAccountId = query({
  args: {},
  handler: async (ctx) => {
    const account = await ctx.db.query("accounts").order("asc").first();
    if (!account) {
      return null;
    }

    return {
      accountId: account._id,
      handle: account.handle,
      platform: account.platform
    };
  }
});

export const getOrSeedDefaultAccountId = mutation({
  args: {},
  handler: async (ctx) => {
    const existingAccount = await ctx.db.query("accounts").order("asc").first();
    if (existingAccount) {
      return existingAccount._id;
    }

    const ts = nowTs();
    const clerkUserId = "dev_clerk_user";

    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        clerkUserId,
        email: "dev-owner@example.com",
        displayName: "Dev Owner",
        createdAt: ts
      });
      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new Error("Failed to create or load default dev user");
    }

    const accountId = await ctx.db.insert("accounts", {
      ownerUserId: user._id,
      platform: "tiktok",
      platformAccountId: "dev-tiktok-acct-001",
      handle: "devcreator",
      displayName: "Dev Creator Account",
      isActive: true,
      createdAt: ts,
      updatedAt: ts
    });

    await ctx.db.insert("billingAccounts", {
      accountId,
      planType: "free",
      billingStatus: "active",
      createdAt: ts,
      updatedAt: ts
    });

    return accountId;
  }
});
