import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { cleanupMessageScopedData } from "../../../convex/lib/messageCleanup";

type Doc = Record<string, unknown> & { _id: string };

class InMemoryDb {
  private readonly tables = new Map<string, Map<string, Doc>>();

  constructor(seed: Record<string, Doc[]>) {
    for (const [tableName, docs] of Object.entries(seed)) {
      this.tables.set(
        tableName,
        new Map(docs.map((doc) => [doc._id, { ...doc }]))
      );
    }
  }

  query(tableName: string) {
    const db = this;
    const where: Array<{ field: string; value: unknown }> = [];

    const matches = (doc: Doc) =>
      where.every((clause) => (doc as Record<string, unknown>)[clause.field] === clause.value);

    const builder = {
      withIndex(_indexName: string, fn: (q: any) => any) {
        const q = {
          eq(field: string, value: unknown) {
            where.push({ field, value });
            return q;
          }
        };
        fn(q);
        return builder;
      },
      filter(fn: (q: any) => any) {
        const q = {
          field(fieldName: string) {
            return { fieldName };
          },
          eq(fieldInput: string | { fieldName: string }, value: unknown) {
            return {
              field: typeof fieldInput === "string" ? fieldInput : fieldInput.fieldName,
              value
            };
          }
        };
        const clause = fn(q);
        if (clause?.field) {
          where.push({ field: clause.field, value: clause.value });
        }
        return builder;
      },
      async collect() {
        const rows = db.rows(tableName);
        return rows.filter(matches).map((row) => ({ ...row }));
      },
      order() {
        return builder;
      },
      async first() {
        const rows = await builder.collect();
        return rows[0] ?? null;
      },
      async unique() {
        const rows = await builder.collect();
        return rows[0] ?? null;
      },
      async take(limit: number) {
        const rows = await builder.collect();
        return rows.slice(0, limit);
      }
    };

    return builder;
  }

  async delete(id: string) {
    for (const table of this.tables.values()) {
      if (table.has(id)) {
        table.delete(id);
        return;
      }
    }
  }

  async patch(id: string, value: Record<string, unknown>) {
    for (const table of this.tables.values()) {
      const existing = table.get(id);
      if (existing) {
        table.set(id, { ...existing, ...value });
        return;
      }
    }
  }

  rows(tableName: string) {
    return Array.from(this.tables.get(tableName)?.values() ?? []);
  }
}

describe("reviews cleanup message data", () => {
  it("deletes scoped message/comment docs and redacts usage links", async () => {
    const db = new InMemoryDb({
      comments: [
        { _id: "com_1", accountId: "acc_1", platformCommentId: "pc_1", messageId: "msg_1" },
        { _id: "com_2", accountId: "acc_1", platformCommentId: "pc_2", messageId: "msg_2" }
      ],
      replyCandidates: [
        { _id: "cand_1", accountId: "acc_1", commentId: "com_1", messageId: "msg_1" },
        { _id: "cand_2", accountId: "acc_1", commentId: "com_1", messageId: "msg_1b" },
        { _id: "cand_3", accountId: "acc_1", commentId: "com_2", messageId: "msg_2" }
      ],
      commentContexts: [
        { _id: "ctx_1", commentId: "com_1" },
        { _id: "ctx_2", commentId: "com_2" }
      ],
      intentInterpretations: [
        { _id: "intent_1", commentId: "com_1" },
        { _id: "intent_2", commentId: "com_2" }
      ],
      approvalTasks: [
        { _id: "task_1", commentId: "com_1", candidateId: "cand_1" },
        { _id: "task_2", commentId: "com_2", candidateId: "cand_3" }
      ],
      repliesSent: [
        { _id: "sent_1", candidateId: "cand_1", commentId: "com_1" },
        { _id: "sent_2", candidateId: "cand_2", commentId: "com_1" },
        { _id: "sent_3", candidateId: "cand_3", commentId: "com_2" }
      ],
      platformSendReceipts: [
        { _id: "receipt_1", candidateId: "cand_1", commentId: "com_1" },
        { _id: "receipt_2", candidateId: "cand_2", commentId: "com_1" },
        { _id: "receipt_3", candidateId: "cand_3", commentId: "com_2" }
      ],
      engagementActions: [
        { _id: "eng_1", candidateId: "cand_1", commentId: "com_1" },
        { _id: "eng_2", candidateId: "cand_2", commentId: "com_1" },
        { _id: "eng_3", candidateId: "cand_3", commentId: "com_2" }
      ],
      agentRuns: [
        { _id: "run_1", commentId: "com_1" },
        { _id: "run_2", commentId: "com_2" }
      ],
      policyEvents: [
        { _id: "policy_1", accountId: "acc_1", commentId: "com_1" },
        { _id: "policy_2", accountId: "acc_1", commentId: "com_2" }
      ],
      tokenReservations: [
        { _id: "reserve_1", accountId: "acc_1", commentId: "com_1" },
        { _id: "reserve_2", accountId: "acc_1", commentId: "com_2" }
      ],
      tokenUsageEvents: [
        { _id: "usage_1", accountId: "acc_1", commentId: "com_1" },
        { _id: "usage_2", accountId: "acc_1", commentId: "com_2" }
      ]
    });

    const result = await cleanupMessageScopedData(
      { db },
      {
        candidate: { _id: "cand_1", accountId: "acc_1", messageId: "msg_1" },
        comment: { _id: "com_1", messageId: "msg_1", platformCommentId: "pc_1" }
      }
    );

    assert.equal(result.commentId, "com_1");
    assert.equal(result.messageId, "msg_1");
    assert.deepEqual(result.deletedCounts, {
      commentContexts: 1,
      intentInterpretations: 1,
      approvalTasks: 1,
      repliesSent: 2,
      platformSendReceipts: 2,
      engagementActions: 2,
      agentRuns: 1,
      policyEvents: 1,
      replyCandidates: 2,
      comments: 1
    });
    assert.deepEqual(result.redactedCounts, {
      tokenReservations: 1,
      tokenUsageEvents: 1
    });

    assert.deepEqual(
      db.rows("comments").map((doc) => doc._id),
      ["com_2"]
    );
    assert.deepEqual(
      db.rows("replyCandidates").map((doc) => doc._id),
      ["cand_3"]
    );
    assert.deepEqual(
      db.rows("repliesSent").map((doc) => doc._id),
      ["sent_3"]
    );
    assert.deepEqual(
      db.rows("platformSendReceipts").map((doc) => doc._id),
      ["receipt_3"]
    );
    assert.deepEqual(
      db.rows("engagementActions").map((doc) => doc._id),
      ["eng_3"]
    );
    assert.deepEqual(
      db.rows("commentContexts").map((doc) => doc._id),
      ["ctx_2"]
    );
    assert.deepEqual(
      db.rows("intentInterpretations").map((doc) => doc._id),
      ["intent_2"]
    );
    assert.deepEqual(
      db.rows("approvalTasks").map((doc) => doc._id),
      ["task_2"]
    );
    assert.deepEqual(
      db.rows("agentRuns").map((doc) => doc._id),
      ["run_2"]
    );
    assert.deepEqual(
      db.rows("policyEvents").map((doc) => doc._id),
      ["policy_2"]
    );

    const [redactedReservation] = db.rows("tokenReservations").filter((doc) => doc._id === "reserve_1");
    assert.equal(redactedReservation?.commentId, undefined);
    const [untouchedReservation] = db.rows("tokenReservations").filter((doc) => doc._id === "reserve_2");
    assert.equal(untouchedReservation?.commentId, "com_2");

    const [redactedUsage] = db.rows("tokenUsageEvents").filter((doc) => doc._id === "usage_1");
    assert.equal(redactedUsage?.commentId, undefined);
    const [untouchedUsage] = db.rows("tokenUsageEvents").filter((doc) => doc._id === "usage_2");
    assert.equal(untouchedUsage?.commentId, "com_2");
  });
});
