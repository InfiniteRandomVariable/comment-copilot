import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  getCommentOrchestrationMode,
  isExplicitCommentOrchestrationMode
} from "../app/api/_lib/orchestrationMode";

describe("getCommentOrchestrationMode", () => {
  it("returns inline when env value is inline", () => {
    assert.equal(getCommentOrchestrationMode("inline"), "inline");
  });

  it("returns temporal for temporal value", () => {
    assert.equal(getCommentOrchestrationMode("temporal"), "temporal");
  });

  it("falls back to temporal for unknown or missing values", () => {
    assert.equal(getCommentOrchestrationMode(undefined), "temporal");
    assert.equal(getCommentOrchestrationMode(""), "temporal");
    assert.equal(getCommentOrchestrationMode("bogus"), "temporal");
  });

  it("normalizes casing and surrounding spaces", () => {
    assert.equal(getCommentOrchestrationMode("INLINE"), "inline");
    assert.equal(getCommentOrchestrationMode("  temporal  "), "temporal");
  });

  it("detects whether mode was explicitly configured", () => {
    assert.equal(isExplicitCommentOrchestrationMode(undefined), false);
    assert.equal(isExplicitCommentOrchestrationMode(""), false);
    assert.equal(isExplicitCommentOrchestrationMode("invalid"), false);
    assert.equal(isExplicitCommentOrchestrationMode("inline"), true);
    assert.equal(isExplicitCommentOrchestrationMode(" TEMPORAL "), true);
  });
});
