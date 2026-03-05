import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  resolveConnectionHealth,
  resolveTokenHealth,
  resolveUsageHealth
} from "../app/settings/health";

describe("settings account health helpers", () => {
  it("flags disconnected accounts as critical", () => {
    const status = resolveConnectionHealth(false);
    assert.equal(status.label, "Disconnected");
    assert.equal(status.level, "critical");
  });

  it("marks token expiry windows correctly", () => {
    const now = Date.UTC(2026, 2, 5, 12, 0, 0);

    const expired = resolveTokenHealth(now - 1, now);
    assert.equal(expired.level, "critical");

    const expiringSoon = resolveTokenHealth(now + 24 * 60 * 60 * 1000, now);
    assert.equal(expiringSoon.level, "warning");

    const healthy = resolveTokenHealth(now + 7 * 24 * 60 * 60 * 1000, now);
    assert.equal(healthy.level, "good");
  });

  it("surfaces billing and token cap warnings", () => {
    const billingIssue = resolveUsageHealth({
      monthKey: "2026-03",
      billingPlan: "paid",
      billingStatus: "past_due",
      usedTokens: 100,
      includedTokens: 10_000,
      warningThreshold: 8_000,
      hardCap: 10_000,
      overageTokens: 0,
      estimatedOverageCents: 0
    });
    assert.equal(billingIssue.level, "critical");

    const capReached = resolveUsageHealth({
      monthKey: "2026-03",
      billingPlan: "free",
      billingStatus: "active",
      usedTokens: 10_000,
      includedTokens: 10_000,
      warningThreshold: 8_000,
      hardCap: 10_000,
      overageTokens: 0,
      estimatedOverageCents: 0
    });
    assert.equal(capReached.level, "critical");

    const warning = resolveUsageHealth({
      monthKey: "2026-03",
      billingPlan: "free",
      billingStatus: "active",
      usedTokens: 8_200,
      includedTokens: 10_000,
      warningThreshold: 8_000,
      hardCap: 10_000,
      overageTokens: 0,
      estimatedOverageCents: 0
    });
    assert.equal(warning.level, "warning");
  });
});
