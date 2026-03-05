import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_WINDOW_DAYS,
  buildUsageDashboardMetrics,
  clampWindowDays,
  utcMonthKey
} from "../../../convex/lib/usageDashboard";

describe("Usage dashboard metrics aggregation", () => {
  it("computes send outcomes, auto-send, backlog age, and token trend", () => {
    const nowTs = Date.UTC(2026, 2, 5, 12, 0, 0);

    const summary = buildUsageDashboardMetrics({
      nowTs,
      windowDays: 30,
      monthKey: utcMonthKey(nowTs),
      pendingTaskCreationTimes: [
        nowTs - 30 * 60 * 1000,
        nowTs - 2 * 60 * 60 * 1000,
        nowTs - 8 * 60 * 60 * 1000
      ],
      sends: [
        { sentAt: nowTs - 24 * 60 * 60 * 1000, sentBy: "autopilot" },
        { sentAt: nowTs - 2 * 24 * 60 * 60 * 1000, sentBy: "owner" },
        { sentAt: nowTs - 45 * 24 * 60 * 60 * 1000, sentBy: "owner_edited" }
      ],
      failedCandidates: [
        { sendAttemptedAt: nowTs - 3 * 24 * 60 * 60 * 1000, createdAt: nowTs },
        { createdAt: nowTs - 60 * 24 * 60 * 60 * 1000 }
      ],
      tokenUsageEvents: [
        {
          createdAt: Date.UTC(2026, 2, 1, 2, 0, 0),
          eventType: "reserve",
          totalTokens: 100
        },
        {
          createdAt: Date.UTC(2026, 2, 1, 18, 0, 0),
          eventType: "finalize",
          totalTokens: 50
        },
        {
          createdAt: Date.UTC(2026, 2, 2, 6, 0, 0),
          eventType: "adjust",
          totalTokens: 70
        }
      ],
      monthlyUsage: {
        usedTokens: 8_400,
        includedTokens: 10_000
      }
    });

    assert.equal(summary.sendOutcomes.successCount, 2);
    assert.equal(summary.sendOutcomes.failedCount, 1);
    assert.equal(summary.sendOutcomes.attemptCount, 3);
    assert.equal(summary.sendOutcomes.successRatePct, 66.67);
    assert.equal(summary.sendOutcomes.failureRatePct, 33.33);

    assert.equal(summary.autoSend.autopilotCount, 1);
    assert.equal(summary.autoSend.ownerCount, 1);
    assert.equal(summary.autoSend.ownerEditedCount, 0);
    assert.equal(summary.autoSend.autoSendRatePct, 50);

    assert.equal(summary.reviewBacklog.pendingCount, 3);
    assert.equal(summary.reviewBacklog.oldestAgeMinutes, 480);
    assert.equal(summary.reviewBacklog.staleOver1hCount, 2);
    assert.equal(summary.reviewBacklog.staleOver6hCount, 1);

    assert.equal(summary.tokenBurn.totalTrackedTokens, 220);
    assert.equal(summary.tokenBurn.averageDailyTokens, 110);
    assert.equal(summary.tokenBurn.utilizationRatePct, 84);
    assert.equal(summary.tokenBurn.daily.length, 2);
    assert.deepEqual(summary.tokenBurn.daily[0], {
      dayKey: "2026-03-01",
      totalTokens: 150,
      reserveTokens: 100,
      finalizeTokens: 50,
      adjustTokens: 0,
      eventCount: 2
    });
  });

  it("uses sane defaults when windowDays is unset or out of bounds", () => {
    assert.equal(clampWindowDays(undefined), DEFAULT_WINDOW_DAYS);
    assert.equal(clampWindowDays(0), 1);
    assert.equal(clampWindowDays(200), 90);
  });

  it("returns zeroed rates when there are no attempts", () => {
    const nowTs = Date.UTC(2026, 2, 5, 12, 0, 0);
    const summary = buildUsageDashboardMetrics({
      nowTs,
      windowDays: 14,
      monthKey: "2026-03",
      pendingTaskCreationTimes: [],
      sends: [],
      failedCandidates: [],
      tokenUsageEvents: [],
      monthlyUsage: {
        usedTokens: 0,
        includedTokens: 10_000
      }
    });

    assert.equal(summary.sendOutcomes.successRatePct, 0);
    assert.equal(summary.sendOutcomes.failureRatePct, 0);
    assert.equal(summary.autoSend.autoSendRatePct, 0);
    assert.equal(summary.tokenBurn.daily.length, 0);
    assert.equal(summary.tokenBurn.averageDailyTokens, 0);
  });
});
