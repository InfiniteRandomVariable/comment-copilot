import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { nowTs } from "./utils";

const intentLabelValidator = v.union(
  v.literal("question"),
  v.literal("praise"),
  v.literal("objection"),
  v.literal("troll"),
  v.literal("purchase_intent"),
  v.literal("support_request"),
  v.literal("unknown")
);

function classifyIntent(text: string) {
  const normalized = text.toLowerCase();

  if (normalized.includes("?") || normalized.startsWith("how") || normalized.startsWith("what")) {
    return {
      intentLabel: "question" as const,
      intentConfidence: 0.88,
      engagementGoal: "Answer clearly and invite follow-up discussion.",
      safetyFlags: [] as string[]
    };
  }

  if (
    normalized.includes("buy") ||
    normalized.includes("price") ||
    normalized.includes("link") ||
    normalized.includes("where can i get")
  ) {
    return {
      intentLabel: "purchase_intent" as const,
      intentConfidence: 0.9,
      engagementGoal: "Convert interest into a warm next step.",
      safetyFlags: [] as string[]
    };
  }

  if (
    normalized.includes("scam") ||
    normalized.includes("fake") ||
    normalized.includes("bad") ||
    normalized.includes("terrible")
  ) {
    return {
      intentLabel: "objection" as const,
      intentConfidence: 0.84,
      engagementGoal: "De-escalate and respond with empathy.",
      safetyFlags: [] as string[]
    };
  }

  if (normalized.includes("love") || normalized.includes("amazing") || normalized.includes("awesome")) {
    return {
      intentLabel: "praise" as const,
      intentConfidence: 0.86,
      engagementGoal: "Amplify positive momentum and keep engagement going.",
      safetyFlags: [] as string[]
    };
  }

  if (normalized.includes("help") || normalized.includes("issue") || normalized.includes("problem")) {
    return {
      intentLabel: "support_request" as const,
      intentConfidence: 0.83,
      engagementGoal: "Provide support path and set expectations.",
      safetyFlags: [] as string[]
    };
  }

  const safetyFlags: string[] = [];
  if (normalized.includes("threat") || normalized.includes("kill") || normalized.includes("suicide")) {
    safetyFlags.push("safety_sensitive");
  }

  if (normalized.includes("idiot") || normalized.includes("hate")) {
    return {
      intentLabel: "troll" as const,
      intentConfidence: 0.79,
      engagementGoal: "Keep response calm, short, and non-inflammatory.",
      safetyFlags
    };
  }

  return {
    intentLabel: "unknown" as const,
    intentConfidence: 0.62,
    engagementGoal: "Acknowledge and invite clarification.",
    safetyFlags
  };
}

export const getIntentInterpretationByComment = query({
  args: {
    accountId: v.id("accounts"),
    commentId: v.id("comments")
  },
  handler: async (ctx, args) => {
    const interpretation = await ctx.db
      .query("intentInterpretations")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .order("desc")
      .first();

    if (!interpretation || interpretation.accountId !== args.accountId) {
      return null;
    }

    return interpretation;
  }
});

export const interpretCommentIntent = mutation({
  args: {
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    commentText: v.string()
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.accountId !== args.accountId) {
      throw new Error("Comment not found for account");
    }

    const parsed = classifyIntent(args.commentText);
    const ts = nowTs();

    const existing = await ctx.db
      .query("intentInterpretations")
      .withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        intentLabel: parsed.intentLabel,
        intentConfidence: Number(parsed.intentConfidence.toFixed(2)),
        engagementGoal: parsed.engagementGoal,
        safetyFlags: parsed.safetyFlags,
        updatedAt: ts
      });
    } else {
      await ctx.db.insert("intentInterpretations", {
        accountId: args.accountId,
        commentId: args.commentId,
        intentLabel: parsed.intentLabel,
        intentConfidence: Number(parsed.intentConfidence.toFixed(2)),
        engagementGoal: parsed.engagementGoal,
        safetyFlags: parsed.safetyFlags,
        createdAt: ts,
        updatedAt: ts
      });
    }

    await ctx.db.patch(args.commentId, {
      status: "intent_interpreted",
      updatedAt: ts
    });

    return {
      intentLabel: parsed.intentLabel,
      intentConfidence: Number(parsed.intentConfidence.toFixed(2)),
      engagementGoal: parsed.engagementGoal,
      safetyFlags: parsed.safetyFlags
    };
  }
});

export { intentLabelValidator };
