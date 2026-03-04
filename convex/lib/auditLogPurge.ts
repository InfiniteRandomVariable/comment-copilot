const DEFAULT_PURGE_BATCH_SIZE = 200;
const MAX_PURGE_BATCH_SIZE = 1000;
const DEFAULT_MAX_BATCHES = 10;
const MAX_BATCHES = 100;

function resolveBatchSize(requested?: number) {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_PURGE_BATCH_SIZE;
  }

  return Math.max(1, Math.min(Math.floor(requested), MAX_PURGE_BATCH_SIZE));
}

function resolveMaxBatches(requested?: number) {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_MAX_BATCHES;
  }

  return Math.max(1, Math.min(Math.floor(requested), MAX_BATCHES));
}

export async function purgeExpiredAuditLogsFromStore(
  db: any,
  args: {
    cutoffTs: number;
    batchSize?: number;
    maxBatches?: number;
  }
) {
  const batchSize = resolveBatchSize(args.batchSize);
  const maxBatches = resolveMaxBatches(args.maxBatches);

  let deletedCount = 0;
  let batchesRun = 0;
  let hasMore = false;

  for (let index = 0; index < maxBatches; index += 1) {
    const expiredAuditLogs = await db
      .query("auditLogs")
      .withIndex("by_createdAt", (q: any) => q.lt("createdAt", args.cutoffTs))
      .take(batchSize);

    if (expiredAuditLogs.length === 0) {
      hasMore = false;
      break;
    }

    batchesRun += 1;

    for (const auditLog of expiredAuditLogs) {
      await db.delete(auditLog._id);
    }

    deletedCount += expiredAuditLogs.length;

    if (expiredAuditLogs.length < batchSize) {
      hasMore = false;
      break;
    }

    hasMore = true;
  }

  return {
    deletedCount,
    batchesRun,
    batchSize,
    maxBatches,
    hasMore
  };
}
