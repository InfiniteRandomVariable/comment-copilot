import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildCommentContext } from "../../../convex/context";

type Doc = Record<string, unknown> & { _id: string; _creationTime?: number };

class InMemoryDb {
  private readonly tables = new Map<string, Map<string, Doc>>();
  private readonly counters = new Map<string, number>();
  private creationTime = 1;

  constructor(seed: Record<string, Doc[]>) {
    for (const [tableName, docs] of Object.entries(seed)) {
      this.tables.set(
        tableName,
        new Map(
          docs.map((doc, index) => [
            doc._id,
            { ...doc, _creationTime: doc._creationTime ?? index + 1 }
          ])
        )
      );
      this.creationTime = Math.max(this.creationTime, docs.length + 1);
    }
  }

  async get(id: string) {
    for (const table of this.tables.values()) {
      const row = table.get(id);
      if (row) return { ...row };
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
    table.set(id, { _id: id, _creationTime: this.creationTime++, ...value });
    return id;
  }

  query(tableName: string) {
    const db = this;
    const clauses: Array<{ field: string; value: unknown }> = [];

    const rows = () => db.rows(tableName).filter((doc) =>
      clauses.every((clause) => doc[clause.field] === clause.value)
    );

    const readCursor = (orderedRows: Doc[]) => ({
      async collect() {
        return orderedRows;
      },
      async first() {
        return orderedRows[0] ?? null;
      },
      async unique() {
        return orderedRows[0] ?? null;
      },
      order(direction: "asc" | "desc") {
        const sorted = [...orderedRows].sort((a, b) => {
          const aSortKey =
            (typeof a.updatedAt === "number" && a.updatedAt) ||
            (typeof a.createdAt === "number" && a.createdAt) ||
            (a._creationTime ?? 0);
          const bSortKey =
            (typeof b.updatedAt === "number" && b.updatedAt) ||
            (typeof b.createdAt === "number" && b.createdAt) ||
            (b._creationTime ?? 0);
          return direction === "desc" ? bSortKey - aSortKey : aSortKey - bSortKey;
        });
        return readCursor(sorted);
      }
    });

    return {
      withIndex(_indexName: string, fn: (q: any) => any) {
        const q = {
          eq(field: string, value: unknown) {
            clauses.push({ field, value });
            return q;
          }
        };
        fn(q);
        return readCursor(rows());
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

describe("context.buildCommentContext", () => {
  it("uses active skill versions and ignores draft versions at runtime", async () => {
    const db = new InMemoryDb({
      accounts: [
        { _id: "acc_1", handle: "creator", displayName: "Creator Account" }
      ],
      comments: [
        {
          _id: "com_1",
          accountId: "acc_1",
          platformCommentId: "pc_1",
          platformPostId: "post_1",
          commenterPlatformId: "user_1",
          text: "Love this",
          sourceVideoTitle: "Video title",
          status: "ingested",
          updatedAt: 1
        }
      ],
      responseStyleSkillVersions: [
        {
          _id: "style_active_1",
          accountId: "acc_1",
          status: "active",
          markdown: "ACTIVE_STYLE",
          version: 1,
          createdAt: 10,
          updatedAt: 10
        },
        {
          _id: "style_draft_2",
          accountId: "acc_1",
          status: "draft",
          markdown: "DRAFT_STYLE",
          version: 2,
          createdAt: 20,
          updatedAt: 20
        }
      ],
      customResponseStyleSkillVersions: [
        {
          _id: "custom_active_1",
          accountId: "acc_1",
          status: "active",
          markdown: "ACTIVE_CUSTOM_STYLE",
          version: 1,
          createdAt: 30,
          updatedAt: 30
        },
        {
          _id: "custom_draft_2",
          accountId: "acc_1",
          status: "draft",
          markdown: "DRAFT_CUSTOM_STYLE",
          version: 2,
          createdAt: 40,
          updatedAt: 40
        }
      ]
    });

    const result = await (buildCommentContext as any)._handler(
      { db },
      { accountId: "acc_1", commentId: "com_1" }
    );

    assert.equal(result.responseStyleSkillVersionId, "style_active_1");
    assert.equal(result.responseStyleMarkdown, "ACTIVE_STYLE");
    assert.equal(result.customResponseStyleSkillVersionId, "custom_active_1");
    assert.equal(result.customStyleMarkdown, "ACTIVE_CUSTOM_STYLE");
    assert.ok(!result.missingContextFields.includes("responseStyleSkill"));

    const snapshot = JSON.parse(result.contextSnapshotJson);
    assert.equal(snapshot.responseStyleSkillVersionId, "style_active_1");
    assert.equal(snapshot.responseStyleMarkdown, "ACTIVE_STYLE");
    assert.equal(snapshot.customResponseStyleSkillVersionId, "custom_active_1");
    assert.equal(snapshot.customStyleMarkdown, "ACTIVE_CUSTOM_STYLE");

    const comment = await db.get("com_1");
    assert.equal(comment?.status, "context_collected");
  });

  it("does not use draft-only skill versions", async () => {
    const db = new InMemoryDb({
      accounts: [{ _id: "acc_1", handle: "creator", displayName: "Creator Account" }],
      comments: [
        {
          _id: "com_1",
          accountId: "acc_1",
          platformCommentId: "pc_1",
          platformPostId: "post_1",
          commenterPlatformId: "user_1",
          text: "Love this",
          status: "ingested",
          updatedAt: 1
        }
      ],
      responseStyleSkillVersions: [
        {
          _id: "style_draft_1",
          accountId: "acc_1",
          status: "draft",
          markdown: "DRAFT_STYLE",
          version: 1,
          createdAt: 10,
          updatedAt: 10
        }
      ],
      customResponseStyleSkillVersions: [
        {
          _id: "custom_draft_1",
          accountId: "acc_1",
          status: "draft",
          markdown: "DRAFT_CUSTOM_STYLE",
          version: 1,
          createdAt: 11,
          updatedAt: 11
        }
      ]
    });

    const result = await (buildCommentContext as any)._handler(
      { db },
      { accountId: "acc_1", commentId: "com_1" }
    );

    assert.equal(result.responseStyleSkillVersionId, null);
    assert.equal(result.responseStyleMarkdown, "");
    assert.equal(result.customResponseStyleSkillVersionId, null);
    assert.equal(result.customStyleMarkdown, "");
    assert.ok(result.missingContextFields.includes("responseStyleSkill"));

    const snapshot = JSON.parse(result.contextSnapshotJson);
    assert.equal(snapshot.responseStyleSkillVersionId, undefined);
    assert.equal(snapshot.responseStyleMarkdown, "");
    assert.equal(snapshot.customResponseStyleSkillVersionId, undefined);
    assert.equal(snapshot.customStyleMarkdown, "");
  });
});
