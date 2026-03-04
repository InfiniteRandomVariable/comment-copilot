import { proxyActivities } from "@temporalio/workflow";

export interface CommentWorkflowInput {
  accountId: string;
  commentId: string;
}

interface ContextResult {
  accountId: string;
  commentId: string;
  messageId: string;
  commentText: string;
  sourceVideoTitle: string;
  creatorThemeSummary: string;
  commenterProfileSummary: unknown;
  commenterLatestVideoSummary: unknown;
  responseStyleSkillVersionId: string | null;
  customResponseStyleSkillVersionId: string | null;
  responseStyleMarkdown: string;
  customStyleMarkdown: string;
  contextCompleteness: "complete" | "partial";
  missingContextFields: string[];
  contextSnapshotJson: string;
}

interface IntentResult {
  intentLabel:
    | "question"
    | "praise"
    | "objection"
    | "troll"
    | "purchase_intent"
    | "support_request"
    | "unknown";
  intentConfidence: number;
  engagementGoal: string;
  safetyFlags: string[];
}

interface GenerationResult {
  draftText: string;
  confidenceScore: number;
  rationale: string;
  personalizationSignals: string[];
  generationTelemetry: {
    providerAttempts: number;
    providerRetries: number;
    providerStatusCode: number | null;
    providerUsedRetryAfter: boolean;
    model: string;
  };
}

interface SafetyResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  safetyFlags: string[];
  rationale: string;
  moderationTelemetry: {
    providerAttempts: number;
    providerRetries: number;
    providerStatusCode: number | null;
    providerUsedRetryAfter: boolean;
    model: string;
  };
}

export interface CommentWorkflowActivities {
  logStage: (args: {
    accountId: string;
    commentId: string;
    stage:
      | "context"
      | "intent"
      | "generation"
      | "safety"
      | "routing"
      | "review"
      | "engagement";
    runStatus: "started" | "completed" | "failed";
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  buildContext: (input: CommentWorkflowInput) => Promise<ContextResult>;
  interpretIntent: (input: {
    accountId: string;
    commentId: string;
    commentText: string;
  }) => Promise<IntentResult>;
  generateDraft: (input: ContextResult & IntentResult) => Promise<GenerationResult>;
  runSafetyGate: (input: {
    accountId: string;
    commentId: string;
    commentText: string;
    draftText: string;
    intentLabel: IntentResult["intentLabel"];
    intentConfidence: number;
    safetyFlags: string[];
  }) => Promise<SafetyResult>;
  routeAndPersist: (input: {
    accountId: string;
    commentId: string;
    messageId: string;
    draftText: string;
    confidenceScore: number;
    rationale: string;
    personalizationSignals: string[];
    intentLabel: IntentResult["intentLabel"];
    intentConfidence: number;
    riskScore: number;
    riskLevel: SafetyResult["riskLevel"];
    responseStyleSkillVersionId: string | null;
    customResponseStyleSkillVersionId: string | null;
    contextSnapshotJson: string;
  }) => Promise<
    | { route: "auto_send"; candidateId: string }
    | { route: "pending_review"; candidateId: string; approvalTaskId?: string }
  >;
}

const defaultActivities = proxyActivities<CommentWorkflowActivities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3
  }
});

export async function runCommentWorkflow(
  input: CommentWorkflowInput,
  activities: CommentWorkflowActivities
) {
  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "context",
    runStatus: "started",
    metadata: {}
  });

  const context = await activities.buildContext(input);

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "context",
    runStatus: "completed",
    metadata: {
      contextCompleteness: context.contextCompleteness,
      missingContextFields: context.missingContextFields
    }
  });

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "intent",
    runStatus: "started",
    metadata: {}
  });

  const intent = await activities.interpretIntent({
    accountId: input.accountId,
    commentId: input.commentId,
    commentText: context.commentText
  });

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "intent",
    runStatus: "completed",
    metadata: {
      intentLabel: intent.intentLabel,
      intentConfidence: intent.intentConfidence,
      safetyFlags: intent.safetyFlags
    }
  });

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "generation",
    runStatus: "started",
    metadata: {}
  });

  let draft: GenerationResult;
  try {
    draft = await activities.generateDraft({
      ...context,
      ...intent
    });
  } catch (error) {
    await activities.logStage({
      accountId: input.accountId,
      commentId: input.commentId,
      stage: "generation",
      runStatus: "failed",
      metadata: {
        reason: error instanceof Error ? error.message : "generation_failed"
      }
    });
    throw error;
  }

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "generation",
    runStatus: "completed",
    metadata: {
      confidenceScore: draft.confidenceScore,
      personalizationSignals: draft.personalizationSignals,
      generationTelemetry: draft.generationTelemetry
    }
  });

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "safety",
    runStatus: "started",
    metadata: {}
  });

  let safety: SafetyResult;
  try {
    safety = await activities.runSafetyGate({
      accountId: input.accountId,
      commentId: input.commentId,
      commentText: context.commentText,
      draftText: draft.draftText,
      intentLabel: intent.intentLabel,
      intentConfidence: intent.intentConfidence,
      safetyFlags: intent.safetyFlags
    });
  } catch (error) {
    await activities.logStage({
      accountId: input.accountId,
      commentId: input.commentId,
      stage: "safety",
      runStatus: "failed",
      metadata: {
        reason: error instanceof Error ? error.message : "safety_failed"
      }
    });
    throw error;
  }

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "safety",
    runStatus: "completed",
    metadata: {
      riskScore: safety.riskScore,
      riskLevel: safety.riskLevel,
      safetyFlags: safety.safetyFlags,
      moderationTelemetry: safety.moderationTelemetry
    }
  });

  const routeResult = await activities.routeAndPersist({
    accountId: input.accountId,
    commentId: input.commentId,
    messageId: context.messageId,
    draftText: draft.draftText,
    confidenceScore: draft.confidenceScore,
    rationale: draft.rationale,
    personalizationSignals: draft.personalizationSignals,
    intentLabel: intent.intentLabel,
    intentConfidence: intent.intentConfidence,
    riskScore: safety.riskScore,
    riskLevel: safety.riskLevel,
    responseStyleSkillVersionId: context.responseStyleSkillVersionId,
    customResponseStyleSkillVersionId: context.customResponseStyleSkillVersionId,
    contextSnapshotJson: context.contextSnapshotJson
  });

  await activities.logStage({
    accountId: input.accountId,
    commentId: input.commentId,
    stage: "routing",
    runStatus: "completed",
    metadata: routeResult
  });

  return routeResult;
}

export async function commentWorkflow(input: CommentWorkflowInput) {
  return runCommentWorkflow(input, defaultActivities);
}
