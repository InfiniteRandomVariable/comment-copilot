import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

export const getByClerkUserId = query({
  args: {
    clerkUserId: v.string()
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  }
});

export const upsertFromClerkIdentity = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) {
      return existing._id;
    }

    const ts = nowTs();
    return ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email ?? `${args.clerkUserId}@placeholder.local`,
      displayName: args.displayName ?? "Creator",
      createdAt: ts
    });
  }
});
