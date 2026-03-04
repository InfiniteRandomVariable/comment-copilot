import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createReplyCandidateWithRouting } from "../../../convex/lib/draftCandidateRouting";

type Doc = Record<string, unknown> & { _id: string };

class InMemoryDb {
  private readonly tables = new Map<string, Map<string, Doc>>();
  private readonly counters = new Map<string, number>();

  constructor(seed: Record<string, Doc[]>) {
    for (const [tableName, docs] of Object.entries(seed)) {
      this.tables.set(
        tableName,
        new Map(docs.map((doc) => [doc._id, { ...doc }]))
      );
    }
  }

  async get(id: string) {
    for (const table of this.tables.values()) {
      const row = table.get(id);
      if (row) {
        return { ...row };
      }
    }
    return null;
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

  async insert(tableName: string, value: Record<string, unknown>) {
    const table = this.table(tableName);
    const id = this.nextId(tableName);
    table.set(id, { _id: id, ...value });
    return id;
  }

  query(tableName: string) {
    const db = this;
    const clauses: Array<{ field: string; value: unknown }> = [];

    const matches = (doc: Doc) =>
      clauses.every((clause) => doc[clause.field] === clause.value);

    return {
      withIndex(_indexName: string, fn: (q: any) => any) {
        const q = {
          eq(field: string, value: unknown) {
            clauses.push({ field, value });
            return q;
          }
        };
        fn(q);
        return {
          async collect() {
            return db.rows(tableName).filter(matches);
          },
          async unique() {
            const rows = db.rows(tableName).filter(matches);
            return rows[0] ?? null;
          }
        };
      }
    };
  }

  rows(tableName: string) {
    return Array.from(this.table(tableName).values()).map((row) => ({ ...row }));
  }

  private table(tableName: string) {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new Map());
    }
    return this.tables.get(tableName)!;
  }

  private nextId(tableName: string) {
    const next = (this.counters.get(tableName) ?? 0) + 1;
    this.counters.set(tableName, next);
    return `${tableName}_${next}`;
  }
}

describe("drafts routing", () => {
  it("auto-sends low-risk high-confidence candidates", async () => {
    const db = new InMemoryDb({
      comments: [
        {
          _id: "com_1",
          accountId: "acc_1",
          messageId: "msg_1",
          platformCommentId: "pc_1",
          status: "ingested",
          updatedAt: 1
        }
      ],
      autopilotSettings: [
        {
          _id: "auto_1",
          accountId: "acc_1",
          enabled: true,
          maxRiskScore: 0.25,
          minConfidenceScore: 0.8,
          updatedAt: 1
        }
      ]
    });

    const result = await createReplyCandidateWithRouting(
      { db },
      {
        accountId: "acc_1",
        commentId: "com_1",
        messageId: "msg_1",
        draftText: "Thanks!",
        intentLabel: "praise",
        intentConfidence: 0.9,
        riskScore: 0.1,
        riskLevel: "low",
        personalizationSignals: [],
        contextSnapshotJson: "{\"k\":\"v\"}",
        confidenceScore: 0.92,
        rationale: "Looks safe"
      },
      100
    );

    assert.equal(result.route, "auto_send");
    assert.equal(db.rows("approvalTasks").length, 0);
    assert.equal(db.rows("repliesSent").length, 1);
    assert.equal(db.rows("repliesSent")[0]?.sentBy, "autopilot");
    assert.equal(db.rows("replyCandidates")[0]?.status, "sent");
    assert.equal(db.rows("comments")[0]?.status, "auto_sent");
  });

  it("routes to pending review when thresholds are not met", async () => {
    const db = new InMemoryDb({
      comments: [
        {
          _id: "com_1",
          accountId: "acc_1",
          messageId: "msg_1",
          platformCommentId: "pc_1",
          status: "ingested",
          updatedAt: 1
        }
      ],
      autopilotSettings: [
        {
          _id: "auto_1",
          accountId: "acc_1",
          enabled: true,
          maxRiskScore: 0.25,
          minConfidenceScore: 0.8,
          updatedAt: 1
        }
      ]
    });

    const result = await createReplyCandidateWithRouting(
      { db },
      {
        accountId: "acc_1",
        commentId: "com_1",
        messageId: "msg_1",
        draftText: "Need details",
        intentLabel: "question",
        intentConfidence: 0.7,
        riskScore: 0.9,
        riskLevel: "high",
        personalizationSignals: [],
        contextSnapshotJson: "{\"k\":\"v\"}",
        confidenceScore: 0.6,
        rationale: "Higher risk"
      },
      100
    );

    assert.equal(result.route, "pending_review");
    assert.equal(db.rows("approvalTasks").length, 1);
    assert.equal(db.rows("repliesSent").length, 0);
    assert.equal(db.rows("replyCandidates")[0]?.status, "pending_review");
    assert.equal(db.rows("comments")[0]?.status, "pending_review");
  });

  it("reuses existing pending candidate and task on duplicate routing calls", async () => {
    const db = new InMemoryDb({
      comments: [
        {
          _id: "com_1",
          accountId: "acc_1",
          messageId: "msg_1",
          platformCommentId: "pc_1",
          status: "pending_review",
          updatedAt: 1
        }
      ],
      autopilotSettings: [
        {
          _id: "auto_1",
          accountId: "acc_1",
          enabled: true,
          maxRiskScore: 0.25,
          minConfidenceScore: 0.8,
          updatedAt: 1
        }
      ],
      replyCandidates: [
        {
          _id: "cand_1",
          accountId: "acc_1",
          commentId: "com_1",
          messageId: "msg_1",
          text: "Existing draft",
          status: "pending_review",
          createdAt: 50
        }
      ],
      approvalTasks: [
        {
          _id: "task_1",
          accountId: "acc_1",
          commentId: "com_1",
          candidateId: "cand_1",
          status: "pending",
          createdAt: 50
        }
      ]
    });

    const result = await createReplyCandidateWithRouting(
      { db },
      {
        accountId: "acc_1",
        commentId: "com_1",
        messageId: "msg_1",
        draftText: "New draft text should be ignored",
        intentLabel: "question",
        intentConfidence: 0.7,
        riskScore: 0.9,
        riskLevel: "high",
        personalizationSignals: [],
        contextSnapshotJson: "{\"k\":\"v\"}",
        confidenceScore: 0.5,
        rationale: "Retry"
      },
      200
    );

    assert.equal(result.route, "pending_review");
    assert.equal(result.candidateId, "cand_1");
    assert.equal(result.approvalTaskId, "task_1");
    assert.equal(db.rows("replyCandidates").length, 1);
    assert.equal(db.rows("approvalTasks").length, 1);
  });

  it("reuses existing sent candidate on duplicate routing calls", async () => {
    const db = new InMemoryDb({
      comments: [
        {
          _id: "com_1",
          accountId: "acc_1",
          messageId: "msg_1",
          platformCommentId: "pc_1",
          status: "auto_sent",
          updatedAt: 1
        }
      ],
      replyCandidates: [
        {
          _id: "cand_1",
          accountId: "acc_1",
          commentId: "com_1",
          messageId: "msg_1",
          text: "Existing sent",
          status: "sent",
          createdAt: 50
        }
      ]
    });

    const result = await createReplyCandidateWithRouting(
      { db },
      {
        accountId: "acc_1",
        commentId: "com_1",
        messageId: "msg_1",
        draftText: "New draft text should be ignored",
        intentLabel: "praise",
        intentConfidence: 0.95,
        riskScore: 0.1,
        riskLevel: "low",
        personalizationSignals: [],
        contextSnapshotJson: "{\"k\":\"v\"}",
        confidenceScore: 0.95,
        rationale: "Retry"
      },
      200
    );

    assert.equal(result.route, "auto_send");
    assert.equal(result.candidateId, "cand_1");
    assert.equal(db.rows("replyCandidates").length, 1);
    assert.equal(db.rows("repliesSent").length, 0);
  });

  it("recreates missing pending task for existing review candidate", async () => {
    const db = new InMemoryDb({
      comments: [
        {
          _id: "com_1",
          accountId: "acc_1",
          messageId: "msg_1",
          platformCommentId: "pc_1",
          status: "pending_review",
          updatedAt: 1
        }
      ],
      replyCandidates: [
        {
          _id: "cand_1",
          accountId: "acc_1",
          commentId: "com_1",
          messageId: "msg_1",
          text: "Existing review item",
          status: "pending_review",
          createdAt: 50
        }
      ]
    });

    const result = await createReplyCandidateWithRouting(
      { db },
      {
        accountId: "acc_1",
        commentId: "com_1",
        messageId: "msg_1",
        draftText: "Retry",
        intentLabel: "question",
        intentConfidence: 0.7,
        riskScore: 0.9,
        riskLevel: "high",
        personalizationSignals: [],
        contextSnapshotJson: "{\"k\":\"v\"}",
        confidenceScore: 0.6,
        rationale: "Retry"
      },
      300
    );

    assert.equal(result.route, "pending_review");
    assert.equal(result.candidateId, "cand_1");
    assert.ok(result.approvalTaskId);
    assert.equal(db.rows("replyCandidates").length, 1);
    assert.equal(db.rows("approvalTasks").length, 1);
    assert.equal(db.rows("comments")[0]?.status, "pending_review");
  });
});
