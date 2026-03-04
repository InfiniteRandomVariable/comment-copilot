import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

function extractSignals(lines: string[], limit: number) {
  const counts = new Map<string, number>();

  for (const line of lines) {
    for (const token of line.toLowerCase().split(/[^a-z0-9]+/)) {
      if (!token || token.length < 4) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token, count]) => `${token} (${count})`);
}

function buildResponseStyleMarkdown(args: {
  accountHandle: string;
  titleSignals: string[];
  interactionSignals: string[];
  personality: string;
  expertise: string[];
}) {
  return [
    "# response_style_skill.md",
    "",
    `Account Handle: @${args.accountHandle}`,
    `Core Personality: ${args.personality}`,
    `Expertise Themes: ${args.expertise.join(", ") || "general"}`,
    "",
    "## Voice Rules",
    "- Sound human, warm, and concise.",
    "- Make replies specific to the commenter context when available.",
    "- Prioritize engagement and invite next interaction.",
    "",
    "## Channel Signals",
    ...args.titleSignals.map((item) => `- ${item}`),
    "",
    "## Interaction Signals",
    ...args.interactionSignals.map((item) => `- ${item}`),
    "",
    "## Guardrails",
    "- Do not fabricate factual claims.",
    "- Do not escalate hostile exchanges.",
    "- Keep brand tone consistent with the creator's personality."
  ].join("\n");
}

async function archiveActiveResponseStyle(ctx: any, accountId: string, ts: number) {
  const active = await ctx.db
    .query("responseStyleSkillVersions")
    .withIndex("by_account_status", (q: any) =>
      q.eq("accountId", accountId).eq("status", "active")
    )
    .unique();

  if (!active) return;

  await ctx.db.patch(active._id, {
    status: "archived",
    updatedAt: ts
  });
}

async function archiveActiveCustomStyle(ctx: any, accountId: string, ts: number) {
  const active = await ctx.db
    .query("customResponseStyleSkillVersions")
    .withIndex("by_account_status", (q: any) =>
      q.eq("accountId", accountId).eq("status", "active")
    )
    .unique();

  if (!active) return;

  await ctx.db.patch(active._id, {
    status: "archived",
    updatedAt: ts
  });
}

export const generateResponseStyleSkill = mutation({
  args: {
    accountId: v.id("accounts"),
    createdByUserId: v.optional(v.id("users")),
    accountTitles: v.optional(v.array(v.string())),
    videoTitles: v.optional(v.array(v.string())),
    interactionSnippets: v.optional(v.array(v.string())),
    activate: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const persona = await ctx.db
      .query("personaProfiles")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    const recentComments = await ctx.db
      .query("comments")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(25);

    const titleSignals = extractSignals(
      [...(args.accountTitles ?? []), ...(args.videoTitles ?? [])],
      12
    );
    const interactionSignals = extractSignals(
      [
        ...(args.interactionSnippets ?? []),
        ...recentComments.map((comment) => comment.text)
      ],
      12
    );

    const markdown = buildResponseStyleMarkdown({
      accountHandle: account.handle,
      titleSignals,
      interactionSignals,
      personality: persona?.personalityStyle ?? "friendly",
      expertise: persona?.expertiseTags ?? []
    });

    const latest = await ctx.db
      .query("responseStyleSkillVersions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .first();

    const ts = nowTs();
    const nextVersion = latest ? latest.version + 1 : 1;
    const shouldActivate = args.activate ?? true;

    if (shouldActivate) {
      await archiveActiveResponseStyle(ctx, args.accountId, ts);
    }

    const id = await ctx.db.insert("responseStyleSkillVersions", {
      accountId: args.accountId,
      version: nextVersion,
      status: shouldActivate ? "active" : "draft",
      markdown,
      sourceSummaryJson: JSON.stringify({ titleSignals, interactionSignals }),
      createdByUserId: args.createdByUserId,
      activatedByUserId: shouldActivate ? args.createdByUserId : undefined,
      createdAt: ts,
      updatedAt: ts
    });

    return {
      skillVersionId: id,
      version: nextVersion,
      status: shouldActivate ? "active" : "draft"
    };
  }
});

export const updateCustomResponseStyleSkill = mutation({
  args: {
    accountId: v.id("accounts"),
    markdown: v.string(),
    createdByUserId: v.optional(v.id("users")),
    activate: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    if (args.markdown.trim().length === 0) {
      throw new Error("custom_response_style_skill.md cannot be empty");
    }

    if (args.markdown.length > 1000) {
      throw new Error("custom_response_style_skill.md must be <= 1000 characters");
    }

    const latest = await ctx.db
      .query("customResponseStyleSkillVersions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .first();

    const ts = nowTs();
    const nextVersion = latest ? latest.version + 1 : 1;
    const shouldActivate = args.activate ?? true;

    if (shouldActivate) {
      await archiveActiveCustomStyle(ctx, args.accountId, ts);
    }

    const id = await ctx.db.insert("customResponseStyleSkillVersions", {
      accountId: args.accountId,
      version: nextVersion,
      status: shouldActivate ? "active" : "draft",
      markdown: args.markdown,
      createdByUserId: args.createdByUserId,
      activatedByUserId: shouldActivate ? args.createdByUserId : undefined,
      createdAt: ts,
      updatedAt: ts
    });

    return {
      skillVersionId: id,
      version: nextVersion,
      status: shouldActivate ? "active" : "draft"
    };
  }
});

export const getActiveResponseStyleSkill = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("responseStyleSkillVersions")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", args.accountId).eq("status", "active")
      )
      .unique();
  }
});

export const getActiveCustomResponseStyleSkill = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("customResponseStyleSkillVersions")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", args.accountId).eq("status", "active")
      )
      .unique();
  }
});

export const listSkillVersions = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    const [responseStyle, customStyle] = await Promise.all([
      ctx.db
        .query("responseStyleSkillVersions")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .order("desc")
        .collect(),
      ctx.db
        .query("customResponseStyleSkillVersions")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .order("desc")
        .collect()
    ]);

    return {
      responseStyle,
      customStyle
    };
  }
});
