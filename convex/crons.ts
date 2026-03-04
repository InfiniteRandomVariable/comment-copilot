import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "purge expired audit logs",
  { hours: 24 },
  internal.auditLogs.purgeExpiredAuditLogs,
  {
    batchSize: 200,
    maxBatches: 10
  }
);

export default crons;
