import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  AUDIT_LOG_RETENTION_MONTHS,
  auditLogRetentionCutoffTs
} from "../../../convex/lib/auditRetention";
import { purgeExpiredAuditLogsFromStore } from "../../../convex/lib/auditLogPurge";

describe("audit retention cutoff", () => {
  it("uses the configured 4 calendar month retention window", () => {
    assert.equal(AUDIT_LOG_RETENTION_MONTHS, 4);
  });

  it("subtracts calendar months while preserving day/time when possible", () => {
    const nowTs = Date.parse("2026-03-03T15:45:30.000Z");
    const cutoffTs = auditLogRetentionCutoffTs(nowTs);

    assert.equal(new Date(cutoffTs).toISOString(), "2025-11-03T15:45:30.000Z");
  });

  it("clamps to month end when the target month has fewer days", () => {
    const nowTs = Date.parse("2026-03-31T08:00:00.000Z");
    const cutoffTs = auditLogRetentionCutoffTs(nowTs);

    assert.equal(new Date(cutoffTs).toISOString(), "2025-11-30T08:00:00.000Z");
  });

  it("handles leap-year target months", () => {
    const nowTs = Date.parse("2024-06-30T12:00:00.000Z");
    const cutoffTs = auditLogRetentionCutoffTs(nowTs);

    assert.equal(new Date(cutoffTs).toISOString(), "2024-02-29T12:00:00.000Z");
  });
});

type AuditLogDoc = {
  _id: string;
  createdAt: number;
};

class InMemoryAuditDb {
  private rowsById: AuditLogDoc[];

  constructor(seed: AuditLogDoc[]) {
    this.rowsById = [...seed];
  }

  query(tableName: string) {
    if (tableName !== "auditLogs") {
      throw new Error(`Unsupported table ${tableName}`);
    }

    const db = this;

    return {
      withIndex(indexName: string, fn: (q: any) => any) {
        if (indexName !== "by_createdAt") {
          throw new Error(`Unsupported index ${indexName}`);
        }

        let cutoffTs: number | null = null;
        const q = {
          lt(field: string, value: number) {
            if (field !== "createdAt") {
              throw new Error(`Unsupported field ${field}`);
            }
            cutoffTs = value;
            return q;
          }
        };
        fn(q);

        return {
          async take(limit: number) {
            if (cutoffTs === null) {
              return [];
            }
            return db.rowsById
              .filter((row) => row.createdAt < cutoffTs!)
              .sort((left, right) => left.createdAt - right.createdAt)
              .slice(0, limit)
              .map((row) => ({ ...row }));
          }
        };
      }
    };
  }

  async delete(id: string) {
    this.rowsById = this.rowsById.filter((row) => row._id !== id);
  }

  listRows() {
    return [...this.rowsById].sort((left, right) => left.createdAt - right.createdAt);
  }
}

describe("audit log purge", () => {
  it("purges multiple batches in one run", async () => {
    const db = new InMemoryAuditDb([
      { _id: "old_1", createdAt: 1 },
      { _id: "old_2", createdAt: 2 },
      { _id: "old_3", createdAt: 3 },
      { _id: "old_4", createdAt: 4 },
      { _id: "fresh_1", createdAt: 50 }
    ]);

    const result = await purgeExpiredAuditLogsFromStore(db, {
      cutoffTs: 10,
      batchSize: 2,
      maxBatches: 3
    });

    assert.deepEqual(result, {
      deletedCount: 4,
      batchesRun: 2,
      batchSize: 2,
      maxBatches: 3,
      hasMore: false
    });
    assert.deepEqual(
      db.listRows().map((row) => row._id),
      ["fresh_1"]
    );
  });

  it("reports hasMore when max batch cap is reached", async () => {
    const db = new InMemoryAuditDb([
      { _id: "old_1", createdAt: 1 },
      { _id: "old_2", createdAt: 2 },
      { _id: "old_3", createdAt: 3 },
      { _id: "old_4", createdAt: 4 }
    ]);

    const result = await purgeExpiredAuditLogsFromStore(db, {
      cutoffTs: 10,
      batchSize: 2,
      maxBatches: 1
    });

    assert.equal(result.deletedCount, 2);
    assert.equal(result.batchesRun, 1);
    assert.equal(result.hasMore, true);
    assert.deepEqual(
      db.listRows().map((row) => row._id),
      ["old_3", "old_4"]
    );
  });
});
