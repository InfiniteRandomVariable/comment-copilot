type CleanupCandidate = {
  _id: string;
  accountId: string;
  messageId?: string;
};

type CleanupComment = {
  _id: string;
  messageId?: string;
  platformCommentId: string;
};

type CleanupCtx = {
  db: {
    query: (tableName: string) => {
      withIndex: (indexName: string, fn: (q: any) => any) => any;
      filter: (fn: (q: any) => any) => any;
      collect: () => Promise<any[]>;
    };
    delete: (id: string) => Promise<void>;
    patch: (id: string, value: Record<string, unknown>) => Promise<void>;
  };
};

async function collectByCommentId(ctx: CleanupCtx, tableName: string, commentId: string) {
  return ctx.db
    .query(tableName)
    .withIndex("by_comment", (q: any) => q.eq("commentId", commentId))
    .collect();
}

async function collectByCandidateId(ctx: CleanupCtx, tableName: string, candidateId: string) {
  return ctx.db
    .query(tableName)
    .withIndex("by_candidate", (q: any) => q.eq("candidateId", candidateId))
    .collect();
}

export async function cleanupMessageScopedData(
  ctx: CleanupCtx,
  args: {
    candidate: CleanupCandidate;
    comment: CleanupComment;
  }
) {
  const commentId = args.comment._id;
  const accountId = args.candidate.accountId;
  const messageId =
    args.candidate.messageId ?? args.comment.messageId ?? args.comment.platformCommentId;

  const candidatesForComment = await ctx.db
    .query("replyCandidates")
    .withIndex("by_comment", (q: any) => q.eq("commentId", commentId))
    .collect();

  const [
    commentContexts,
    intentInterpretations,
    approvalTasks,
    agentRuns,
    policyEvents,
    tokenReservations,
    tokenUsageEvents
  ] = await Promise.all([
    collectByCommentId(ctx, "commentContexts", commentId),
    collectByCommentId(ctx, "intentInterpretations", commentId),
    collectByCommentId(ctx, "approvalTasks", commentId),
    collectByCommentId(ctx, "agentRuns", commentId),
    ctx.db
      .query("policyEvents")
      .withIndex("by_account", (q: any) => q.eq("accountId", accountId))
      .filter((q: any) => q.eq(q.field("commentId"), commentId))
      .collect(),
    ctx.db
      .query("tokenReservations")
      .withIndex("by_account", (q: any) => q.eq("accountId", accountId))
      .filter((q: any) => q.eq(q.field("commentId"), commentId))
      .collect(),
    ctx.db
      .query("tokenUsageEvents")
      .withIndex("by_account", (q: any) => q.eq("accountId", accountId))
      .filter((q: any) => q.eq(q.field("commentId"), commentId))
      .collect()
  ]);

  const repliesSentByCandidate = await Promise.all(
    candidatesForComment.map((candidate: any) =>
      collectByCandidateId(ctx, "repliesSent", candidate._id)
    )
  );
  const platformReceiptsByCandidate = await Promise.all(
    candidatesForComment.map((candidate: any) =>
      collectByCandidateId(ctx, "platformSendReceipts", candidate._id)
    )
  );
  const engagementActionsByCandidate = await Promise.all(
    candidatesForComment.map((candidate: any) =>
      collectByCandidateId(ctx, "engagementActions", candidate._id)
    )
  );

  const repliesSent = repliesSentByCandidate.flat();
  const platformReceipts = platformReceiptsByCandidate.flat();
  const engagementActions = engagementActionsByCandidate.flat();

  for (const doc of commentContexts) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of intentInterpretations) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of approvalTasks) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of repliesSent) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of platformReceipts) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of engagementActions) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of agentRuns) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of policyEvents) {
    await ctx.db.delete(doc._id);
  }
  for (const reservation of tokenReservations) {
    await ctx.db.patch(reservation._id, { commentId: undefined });
  }
  for (const event of tokenUsageEvents) {
    await ctx.db.patch(event._id, { commentId: undefined });
  }
  for (const candidate of candidatesForComment) {
    await ctx.db.delete(candidate._id);
  }
  await ctx.db.delete(commentId);

  const deletedCounts = {
    commentContexts: commentContexts.length,
    intentInterpretations: intentInterpretations.length,
    approvalTasks: approvalTasks.length,
    repliesSent: repliesSent.length,
    platformSendReceipts: platformReceipts.length,
    engagementActions: engagementActions.length,
    agentRuns: agentRuns.length,
    policyEvents: policyEvents.length,
    replyCandidates: candidatesForComment.length,
    comments: 1
  };

  const redactedCounts = {
    tokenReservations: tokenReservations.length,
    tokenUsageEvents: tokenUsageEvents.length
  };

  return {
    candidateId: args.candidate._id,
    commentId,
    messageId,
    deletedCounts,
    redactedCounts
  };
}
