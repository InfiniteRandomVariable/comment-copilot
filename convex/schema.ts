import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    displayName: v.string(),
    createdAt: v.number()
  }).index("by_clerk_user", ["clerkUserId"]),

  accounts: defineTable({
    ownerUserId: v.id("users"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    platformAccountId: v.string(),
    handle: v.string(),
    displayName: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_platform_account", ["platform", "platformAccountId"]),

  socialAccounts: defineTable({
    accountId: v.id("accounts"),
    accessTokenRef: v.string(),
    refreshTokenRef: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_account", ["accountId"]),

  comments: defineTable({
    accountId: v.id("accounts"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    platformCommentId: v.string(),
    platformPostId: v.string(),
    commenterPlatformId: v.string(),
    text: v.string(),
    messageId: v.optional(v.string()),
    sourceVideoTitle: v.optional(v.string()),
    commenterUsername: v.optional(v.string()),
    commenterLatestVideoId: v.optional(v.string()),
    commenterLatestVideoTitle: v.optional(v.string()),
    status: v.union(
      v.literal("ingested"),
      v.literal("context_collected"),
      v.literal("intent_interpreted"),
      v.literal("draft_ready"),
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("edited_and_sent"),
      v.literal("rejected"),
      v.literal("sent"),
      v.literal("send_failed"),
      v.literal("post_send_like_done"),
      v.literal("post_send_like_skipped"),
      v.literal("pending"),
      v.literal("needs_review"),
      v.literal("auto_sent"),
      v.literal("ignored"),
      v.literal("reported")
    ),
    receivedAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_platform_comment", ["platform", "platformCommentId"])
    .index("by_account_status", ["accountId", "status"]),

  commenterProfiles: defineTable({
    accountId: v.id("accounts"),
    commenterPlatformId: v.string(),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    recentTitles: v.array(v.string()),
    lastRefreshedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_commenter", ["accountId", "commenterPlatformId"]),

  commenterVideos: defineTable({
    accountId: v.id("accounts"),
    commenterPlatformId: v.string(),
    platformVideoId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    fetchedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_commenter", ["accountId", "commenterPlatformId"])
    .index("by_video", ["platformVideoId"]),

  commentContexts: defineTable({
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    contextCompleteness: v.union(v.literal("complete"), v.literal("partial")),
    missingContextFields: v.array(v.string()),
    payloadJson: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_comment", ["commentId"]),

  intentInterpretations: defineTable({
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    intentLabel: v.union(
      v.literal("question"),
      v.literal("praise"),
      v.literal("objection"),
      v.literal("troll"),
      v.literal("purchase_intent"),
      v.literal("support_request"),
      v.literal("unknown")
    ),
    intentConfidence: v.number(),
    engagementGoal: v.string(),
    safetyFlags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_comment", ["commentId"]),

  replyCandidates: defineTable({
    commentId: v.id("comments"),
    accountId: v.id("accounts"),
    skillVersionId: v.optional(v.id("skillVersions")),
    responseStyleSkillVersionId: v.optional(v.id("responseStyleSkillVersions")),
    customResponseStyleSkillVersionId: v.optional(
      v.id("customResponseStyleSkillVersions")
    ),
    messageId: v.optional(v.string()),
    text: v.string(),
    editedText: v.optional(v.string()),
    confidenceScore: v.optional(v.number()),
    riskScore: v.optional(v.number()),
    riskLevel: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    rationale: v.optional(v.string()),
    intentLabel: v.optional(
      v.union(
        v.literal("question"),
        v.literal("praise"),
        v.literal("objection"),
        v.literal("troll"),
        v.literal("purchase_intent"),
        v.literal("support_request"),
        v.literal("unknown")
      )
    ),
    intentConfidence: v.optional(v.number()),
    personalizationSignals: v.optional(v.array(v.string())),
    contextSnapshotJson: v.optional(v.string()),
    status: v.union(
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("edited_and_sent"),
      v.literal("rejected"),
      v.literal("send_failed"),
      v.literal("sent")
    ),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.id("users")),
    sendAttemptedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_comment", ["commentId"])
    .index("by_account_status_created", ["accountId", "status", "createdAt"])
    .index("by_account_created", ["accountId", "createdAt"])
    .index("by_message_id", ["messageId"]),

  repliesSent: defineTable({
    commentId: v.id("comments"),
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates"),
    messageId: v.optional(v.string()),
    sentText: v.optional(v.string()),
    platformReplyId: v.optional(v.string()),
    sentBy: v.union(v.literal("autopilot"), v.literal("owner"), v.literal("owner_edited")),
    sentAt: v.number()
  })
    .index("by_comment", ["commentId"])
    .index("by_account", ["accountId"])
    .index("by_candidate", ["candidateId"]),

  platformSendReceipts: defineTable({
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    candidateId: v.id("replyCandidates"),
    textHash: v.string(),
    sentText: v.string(),
    platformReplyId: v.optional(v.string()),
    sentBy: v.union(v.literal("owner"), v.literal("owner_edited")),
    sentAt: v.number(),
    createdAt: v.number()
  })
    .index("by_candidate", ["candidateId"])
    .index("by_candidate_text_hash_created", ["candidateId", "textHash", "createdAt"]),

  approvalTasks: defineTable({
    commentId: v.id("comments"),
    accountId: v.id("accounts"),
    candidateId: v.id("replyCandidates"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedByUserId: v.optional(v.id("users"))
  })
    .index("by_account_status", ["accountId", "status"])
    .index("by_comment", ["commentId"]),

  personaProfiles: defineTable({
    accountId: v.id("accounts"),
    expertiseTags: v.array(v.string()),
    personalityStyle: v.union(
      v.literal("educator"),
      v.literal("witty"),
      v.literal("friendly"),
      v.literal("direct"),
      v.literal("luxury"),
      v.literal("playful")
    ),
    ageRange: v.union(
      v.literal("gen_z"),
      v.literal("young_adult"),
      v.literal("adult"),
      v.literal("mixed")
    ),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_account", ["accountId"]),

  skillVersions: defineTable({
    accountId: v.id("accounts"),
    version: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("active")
    ),
    markdown: v.string(),
    sourceSummary: v.object({
      titleSignals: v.array(v.string()),
      interactionSignals: v.array(v.string()),
      generatedAt: v.number()
    }),
    createdByUserId: v.id("users"),
    approvedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_status", ["accountId", "status"])
    .index("by_account_version", ["accountId", "version"]),

  responseStyleSkillVersions: defineTable({
    accountId: v.id("accounts"),
    version: v.number(),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    markdown: v.string(),
    sourceSummaryJson: v.string(),
    createdByUserId: v.optional(v.id("users")),
    activatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_status", ["accountId", "status"])
    .index("by_account_version", ["accountId", "version"]),

  customResponseStyleSkillVersions: defineTable({
    accountId: v.id("accounts"),
    version: v.number(),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    markdown: v.string(),
    createdByUserId: v.optional(v.id("users")),
    activatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_status", ["accountId", "status"])
    .index("by_account_version", ["accountId", "version"]),

  skillApprovals: defineTable({
    accountId: v.id("accounts"),
    skillVersionId: v.id("skillVersions"),
    action: v.union(v.literal("approved"), v.literal("rejected")),
    actionByUserId: v.id("users"),
    note: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_skill_version", ["skillVersionId"]),

  autopilotSettings: defineTable({
    accountId: v.id("accounts"),
    enabled: v.boolean(),
    maxRiskScore: v.number(),
    minConfidenceScore: v.number(),
    updatedAt: v.number()
  }).index("by_account", ["accountId"]),

  engagementActions: defineTable({
    accountId: v.id("accounts"),
    commentId: v.optional(v.id("comments")),
    candidateId: v.id("replyCandidates"),
    actionType: v.literal("like_commenter_video"),
    status: v.union(v.literal("success"), v.literal("skipped"), v.literal("failed")),
    reason: v.optional(v.string()),
    payloadJson: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_candidate", ["candidateId"]),

  billingAccounts: defineTable({
    accountId: v.id("accounts"),
    planType: v.union(v.literal("free"), v.literal("paid")),
    billingStatus: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled")
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"]),

  walletAccounts: defineTable({
    accountId: v.id("accounts"),
    currency: v.literal("usd"),
    balanceCents: v.number(),
    autoRechargeEnabled: v.boolean(),
    autoRechargeThresholdCents: v.number(),
    autoRechargeAmountCents: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_account", ["accountId"]),

  walletTransactions: defineTable({
    accountId: v.id("accounts"),
    walletAccountId: v.id("walletAccounts"),
    monthKey: v.optional(v.string()),
    type: v.union(
      v.literal("credit_purchase"),
      v.literal("usage_debit"),
      v.literal("auto_recharge"),
      v.literal("refund"),
      v.literal("manual_adjustment")
    ),
    direction: v.union(v.literal("credit"), v.literal("debit")),
    amountCents: v.number(),
    referenceId: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_month", ["accountId", "monthKey"])
    .index("by_wallet", ["walletAccountId"]),

  autoRechargeSettings: defineTable({
    accountId: v.id("accounts"),
    enabled: v.boolean(),
    thresholdCents: v.number(),
    rechargeAmountCents: v.number(),
    paymentMethodRef: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_account", ["accountId"]),

  refundEvents: defineTable({
    accountId: v.id("accounts"),
    walletTransactionId: v.id("walletTransactions"),
    reason: v.string(),
    amountCents: v.number(),
    operatorUserId: v.optional(v.id("users")),
    createdAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_wallet_transaction", ["walletTransactionId"]),

  stripeWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    accountId: v.optional(v.id("accounts")),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("processed"),
      v.literal("duplicate"),
      v.literal("ignored_unresolved_account")
    ),
    payloadJson: v.optional(v.string()),
    processedAt: v.number()
  }).index("by_event_id", ["eventId"]),

  monthlyTokenUsage: defineTable({
    accountId: v.id("accounts"),
    monthKey: v.string(),
    includedTokens: v.number(),
    usedTokens: v.number(),
    warningSentAt: v.optional(v.number()),
    capReachedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_month", ["accountId", "monthKey"]),

  tokenReservations: defineTable({
    accountId: v.id("accounts"),
    monthKey: v.string(),
    commentId: v.optional(v.id("comments")),
    workflowId: v.optional(v.string()),
    model: v.optional(v.string()),
    estimatedTokens: v.number(),
    actualTokens: v.optional(v.number()),
    status: v.union(
      v.literal("reserved"),
      v.literal("finalized"),
      v.literal("canceled")
    ),
    createdAt: v.number(),
    finalizedAt: v.optional(v.number())
  })
    .index("by_account", ["accountId"])
    .index("by_account_month", ["accountId", "monthKey"]),

  tokenUsageEvents: defineTable({
    accountId: v.id("accounts"),
    monthKey: v.string(),
    reservationId: v.optional(v.id("tokenReservations")),
    commentId: v.optional(v.id("comments")),
    workflowId: v.optional(v.string()),
    model: v.optional(v.string()),
    eventType: v.union(v.literal("reserve"), v.literal("finalize"), v.literal("adjust")),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    createdAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_month", ["accountId", "monthKey"]),

  notificationEvents: defineTable({
    accountId: v.id("accounts"),
    monthKey: v.string(),
    eventType: v.union(
      v.literal("token_warning_threshold"),
      v.literal("token_free_tier_cap_reached"),
      v.literal("token_40k_warning"),
      v.literal("token_50k_cap_reached"),
      v.literal("token_8k_warning"),
      v.literal("token_10k_cap_reached")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed")
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    payloadJson: v.string(),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    updatedAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_account_month", ["accountId", "monthKey"])
    .index("by_status_created", ["status", "createdAt"]),

  policyEvents: defineTable({
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    candidateId: v.optional(v.id("replyCandidates")),
    eventType: v.union(v.literal("blocked"), v.literal("warning"), v.literal("escalated")),
    reason: v.string(),
    createdAt: v.number()
  }).index("by_account", ["accountId"]),

  agentRuns: defineTable({
    accountId: v.id("accounts"),
    commentId: v.id("comments"),
    workflowId: v.string(),
    runStatus: v.union(v.literal("started"), v.literal("completed"), v.literal("failed")),
    stage: v.union(
      v.literal("context"),
      v.literal("intent"),
      v.literal("generation"),
      v.literal("safety"),
      v.literal("routing"),
      v.literal("review"),
      v.literal("engagement")
    ),
    metadataJson: v.string(),
    createdAt: v.number()
  })
    .index("by_comment", ["commentId"])
    .index("by_status_created", ["runStatus", "createdAt"]),

  auditLogs: defineTable({
    accountId: v.id("accounts"),
    actorType: v.union(v.literal("system"), v.literal("owner"), v.literal("worker")),
    actorId: v.string(),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    payloadJson: v.string(),
    createdAt: v.number()
  })
    .index("by_account", ["accountId"])
    .index("by_createdAt", ["createdAt"])
});
