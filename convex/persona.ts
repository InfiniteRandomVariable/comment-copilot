import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

const personalityValidator = v.union(
  v.literal("educator"),
  v.literal("witty"),
  v.literal("friendly"),
  v.literal("direct"),
  v.literal("luxury"),
  v.literal("playful")
);

const ageRangeValidator = v.union(
  v.literal("gen_z"),
  v.literal("young_adult"),
  v.literal("adult"),
  v.literal("mixed")
);

export const getPersonaProfile = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("personaProfiles")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();
  }
});

export const upsertPersonaProfile = mutation({
  args: {
    accountId: v.id("accounts"),
    expertiseTags: v.array(v.string()),
    personalityStyle: personalityValidator,
    ageRange: ageRangeValidator
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("personaProfiles")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    const ts = nowTs();
    if (existing) {
      await ctx.db.patch(existing._id, {
        expertiseTags: args.expertiseTags,
        personalityStyle: args.personalityStyle,
        ageRange: args.ageRange,
        updatedAt: ts
      });
      return existing._id;
    }

    return ctx.db.insert("personaProfiles", {
      accountId: args.accountId,
      expertiseTags: args.expertiseTags,
      personalityStyle: args.personalityStyle,
      ageRange: args.ageRange,
      createdAt: ts,
      updatedAt: ts
    });
  }
});
