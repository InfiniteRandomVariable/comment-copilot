import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { buildSkillMarkdown } from "./skillTemplate";
import { nowTs } from "./utils";

function extractSignals(lines: string[], limit: number) {
  const stopwords = new Set([
    "about",
    "after",
    "again",
    "also",
    "and",
    "are",
    "been",
    "from",
    "have",
    "just",
    "like",
    "more",
    "that",
    "this",
    "with",
    "your"
  ]);

  const counts = new Map<string, number>();

  for (const line of lines) {
    for (const token of line.toLowerCase().split(/[^a-z0-9]+/)) {
      if (!token || token.length < 4 || stopwords.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token, count]) => `${token} (${count})`);
}

async function insertSkillDraft(
  ctx: any,
  args: {
    accountId: string;
    createdByUserId: string;
    titleSignals: string[];
    interactionSignals: string[];
  }
) {
  const account = await ctx.db.get(args.accountId);
  if (!account) {
    throw new Error("Account not found");
  }

  const persona = await ctx.db
    .query("personaProfiles")
    .withIndex("by_account", (q: any) => q.eq("accountId", args.accountId))
    .unique();

  if (!persona) {
    throw new Error("Persona profile required before skill generation");
  }

  const latest = await ctx.db
    .query("skillVersions")
    .withIndex("by_account", (q: any) => q.eq("accountId", args.accountId))
    .order("desc")
    .first();

  const nextVersion = latest ? latest.version + 1 : 1;
  const ts = nowTs();

  const markdown = buildSkillMarkdown({
    accountHandle: account.handle,
    expertiseTags: persona.expertiseTags,
    personalityStyle: persona.personalityStyle,
    ageRange: persona.ageRange,
    titleSignals: args.titleSignals,
    interactionSignals: args.interactionSignals
  });

  return ctx.db.insert("skillVersions", {
    accountId: args.accountId,
    version: nextVersion,
    status: "draft",
    markdown,
    sourceSummary: {
      titleSignals: args.titleSignals,
      interactionSignals: args.interactionSignals,
      generatedAt: ts
    },
    createdByUserId: args.createdByUserId,
    createdAt: ts,
    updatedAt: ts
  });
}

export const listSkillVersions = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("skillVersions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .collect();
  }
});

export const getActiveSkillVersion = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("skillVersions")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", args.accountId).eq("status", "active")
      )
      .unique();
  }
});

export const generateSkillDraft = mutation({
  args: {
    accountId: v.id("accounts"),
    createdByUserId: v.id("users"),
    titleSignals: v.array(v.string()),
    interactionSignals: v.array(v.string())
  },
  handler: async (ctx, args) => {
    return insertSkillDraft(ctx, {
      accountId: args.accountId,
      createdByUserId: args.createdByUserId,
      titleSignals: args.titleSignals,
      interactionSignals: args.interactionSignals
    });
  }
});

export const generateSkillDraftFromRawInputs = mutation({
  args: {
    accountId: v.id("accounts"),
    createdByUserId: v.id("users"),
    postTitles: v.array(v.string()),
    pastInteractionSnippets: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const titleSignals = extractSignals(args.postTitles, 10);
    const interactionSignals = extractSignals(args.pastInteractionSnippets, 10);

    return insertSkillDraft(ctx, {
      accountId: args.accountId,
      createdByUserId: args.createdByUserId,
      titleSignals,
      interactionSignals
    });
  }
});

export const approveSkillVersion = mutation({
  args: {
    accountId: v.id("accounts"),
    skillVersionId: v.id("skillVersions"),
    actionByUserId: v.id("users"),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillVersionId);
    if (!skill || skill.accountId !== args.accountId) {
      throw new Error("Skill version not found for account");
    }

    const ts = nowTs();

    const activeSkill = await ctx.db
      .query("skillVersions")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", args.accountId).eq("status", "active")
      )
      .unique();

    if (activeSkill) {
      await ctx.db.patch(activeSkill._id, {
        status: "approved",
        updatedAt: ts
      });
    }

    await ctx.db.patch(args.skillVersionId, {
      status: "active",
      approvedByUserId: args.actionByUserId,
      updatedAt: ts
    });

    await ctx.db.insert("skillApprovals", {
      accountId: args.accountId,
      skillVersionId: args.skillVersionId,
      action: "approved",
      actionByUserId: args.actionByUserId,
      note: args.note,
      createdAt: ts
    });

    return args.skillVersionId;
  }
});

export const rejectSkillVersion = mutation({
  args: {
    accountId: v.id("accounts"),
    skillVersionId: v.id("skillVersions"),
    actionByUserId: v.id("users"),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillVersionId);
    if (!skill || skill.accountId !== args.accountId) {
      throw new Error("Skill version not found for account");
    }

    const ts = nowTs();

    await ctx.db.patch(args.skillVersionId, {
      status: "rejected",
      approvedByUserId: args.actionByUserId,
      updatedAt: ts
    });

    await ctx.db.insert("skillApprovals", {
      accountId: args.accountId,
      skillVersionId: args.skillVersionId,
      action: "rejected",
      actionByUserId: args.actionByUserId,
      note: args.note,
      createdAt: ts
    });

    return args.skillVersionId;
  }
});
