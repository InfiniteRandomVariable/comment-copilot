import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  AUDIT_LOG_RETENTION_MONTHS,
  auditLogRetentionCutoffTs
} from "./lib/auditRetention";
import { purgeExpiredAuditLogsFromStore } from "./lib/auditLogPurge";

export const purgeExpiredAuditLogs = internalMutation({
  args: {
    nowTs: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    maxBatches: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const nowTs = args.nowTs ?? Date.now();
    const cutoffTs = auditLogRetentionCutoffTs(nowTs);
    const purgeResult = await purgeExpiredAuditLogsFromStore(ctx.db, {
      cutoffTs,
      batchSize: args.batchSize,
      maxBatches: args.maxBatches
    });

    return {
      ...purgeResult,
      cutoffTs,
      retentionMonths: AUDIT_LOG_RETENTION_MONTHS
    };
  }
});
