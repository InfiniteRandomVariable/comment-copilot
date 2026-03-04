import {
  DEFAULT_AUTOPILOT_MAX_RISK,
  DEFAULT_AUTOPILOT_MIN_CONFIDENCE
} from "../utils";

type DraftRoutingCtx = {
  db: {
    get: (id: string) => Promise<any>;
    patch: (id: string, value: Record<string, unknown>) => Promise<void>;
    insert: (tableName: string, value: Record<string, unknown>) => Promise<string>;
    query: (tableName: string) => {
      withIndex: (
        indexName: string,
        fn: (q: any) => any
      ) => {
        unique: () => Promise<any>;
        collect: () => Promise<any[]>;
      };
    };
  };
};

type CandidateCreationArgs = {
  accountId: string;
  commentId: string;
  messageId?: string;
  draftText: string;
  intentLabel:
    | "question"
    | "praise"
    | "objection"
    | "troll"
    | "purchase_intent"
    | "support_request"
    | "unknown";
  intentConfidence: number;
  riskScore?: number;
  riskLevel?: "low" | "medium" | "high";
  personalizationSignals?: string[];
  contextSnapshotJson: string;
  responseStyleSkillVersionId?: string;
  customResponseStyleSkillVersionId?: string;
  confidenceScore?: number;
  rationale?: string;
};

type AutopilotSettings = {
  enabled: boolean;
  maxRiskScore: number;
  minConfidenceScore: number;
};

function shouldAutoSendCandidate(
  args: CandidateCreationArgs,
  settings: AutopilotSettings | null
) {
  const autopilotEnabled = settings?.enabled ?? true;
  const maxRiskScore = settings?.maxRiskScore ?? DEFAULT_AUTOPILOT_MAX_RISK;
  const minConfidenceScore =
    settings?.minConfidenceScore ?? DEFAULT_AUTOPILOT_MIN_CONFIDENCE;
  const riskScore = typeof args.riskScore === "number" ? args.riskScore : 1;
  const confidenceScore =
    typeof args.confidenceScore === "number" ? args.confidenceScore : 0;

  return (
    autopilotEnabled &&
    riskScore <= maxRiskScore &&
    confidenceScore >= minConfidenceScore
  );
}

export async function createReplyCandidateWithRouting(
  ctx: DraftRoutingCtx,
  args: CandidateCreationArgs,
  nowTs: number
) {
  const comment = await ctx.db.get(args.commentId);
  if (!comment || comment.accountId !== args.accountId) {
    throw new Error("Comment not found for account");
  }

  const existingCandidates =
    await ctx.db
      .query("replyCandidates")
      .withIndex("by_comment", (q: any) => q.eq("commentId", args.commentId))
      .collect();
  const existingCandidate = existingCandidates
    .slice()
    .sort((left: any, right: any) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0];

  if (existingCandidate) {
    if (
      existingCandidate.status === "sent" ||
      existingCandidate.status === "edited_and_sent"
    ) {
      return {
        candidateId: existingCandidate._id,
        route: "auto_send" as const
      };
    }

    const approvalTasks =
      await ctx.db
        .query("approvalTasks")
        .withIndex("by_comment", (q: any) => q.eq("commentId", args.commentId))
        .collect();
    const pendingTask = approvalTasks.find(
      (task: any) =>
        task.candidateId === existingCandidate._id && task.status === "pending"
    );

    if (pendingTask) {
      return {
        candidateId: existingCandidate._id,
        approvalTaskId: pendingTask._id,
        route: "pending_review" as const
      };
    }

    if (
      existingCandidate.status === "pending_review" ||
      existingCandidate.status === "approved" ||
      existingCandidate.status === "send_failed"
    ) {
      const approvalTaskId = await ctx.db.insert("approvalTasks", {
        accountId: args.accountId,
        commentId: args.commentId,
        candidateId: existingCandidate._id,
        status: "pending",
        createdAt: nowTs
      });

      await ctx.db.patch(args.commentId, {
        status: "pending_review",
        updatedAt: nowTs
      });

      return {
        candidateId: existingCandidate._id,
        approvalTaskId,
        route: "pending_review" as const
      };
    }

    return {
      candidateId: existingCandidate._id,
      route: "pending_review" as const
    };
  }

  await ctx.db.patch(args.commentId, {
    status: "draft_ready",
    updatedAt: nowTs
  });

  const candidateId = await ctx.db.insert("replyCandidates", {
    accountId: args.accountId,
    commentId: args.commentId,
    messageId: args.messageId ?? comment.messageId ?? comment.platformCommentId,
    text: args.draftText,
    intentLabel: args.intentLabel,
    intentConfidence: Number(args.intentConfidence.toFixed(2)),
    riskScore: args.riskScore,
    riskLevel: args.riskLevel,
    personalizationSignals: args.personalizationSignals ?? [],
    contextSnapshotJson: args.contextSnapshotJson,
    responseStyleSkillVersionId: args.responseStyleSkillVersionId,
    customResponseStyleSkillVersionId: args.customResponseStyleSkillVersionId,
    confidenceScore: args.confidenceScore,
    rationale: args.rationale,
    status: "pending_review",
    createdAt: nowTs
  });

  const settings = await ctx.db
    .query("autopilotSettings")
    .withIndex("by_account", (q: any) => q.eq("accountId", args.accountId))
    .unique();

  if (shouldAutoSendCandidate(args, settings)) {
    await ctx.db.patch(candidateId, {
      status: "sent",
      reviewedAt: nowTs,
      sendAttemptedAt: nowTs
    });

    await ctx.db.insert("repliesSent", {
      commentId: args.commentId,
      accountId: args.accountId,
      candidateId,
      messageId: args.messageId ?? comment.messageId ?? comment.platformCommentId,
      sentText: args.draftText,
      sentBy: "autopilot",
      sentAt: nowTs
    });

    await ctx.db.patch(args.commentId, {
      status: "auto_sent",
      updatedAt: nowTs
    });

    return {
      candidateId,
      route: "auto_send" as const
    };
  }

  const approvalTaskId = await ctx.db.insert("approvalTasks", {
    accountId: args.accountId,
    commentId: args.commentId,
    candidateId,
    status: "pending",
    createdAt: nowTs
  });

  await ctx.db.patch(args.commentId, {
    status: "pending_review",
    updatedAt: nowTs
  });

  return {
    candidateId,
    approvalTaskId,
    route: "pending_review" as const
  };
}
