const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

export const DEFAULT_WINDOW_DAYS = 14;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 90;

export type UsageSendRecord = {
  sentAt: number;
  sentBy: "autopilot" | "owner" | "owner_edited";
};

export type FailedCandidateRecord = {
  sendAttemptedAt?: number;
  reviewedAt?: number;
  createdAt: number;
};

export type TokenUsageEventRecord = {
  createdAt: number;
  eventType: "reserve" | "finalize" | "adjust";
  totalTokens: number;
};

export type UsageDashboardMetrics = {
  period: {
    nowTs: number;
    monthKey: string;
    windowDays: number;
    windowStartTs: number;
  };
  sendOutcomes: {
    successCount: number;
    failedCount: number;
    attemptCount: number;
    successRatePct: number;
    failureRatePct: number;
  };
  autoSend: {
    autopilotCount: number;
    ownerCount: number;
    ownerEditedCount: number;
    autoSendRatePct: number;
  };
  reviewBacklog: {
    pendingCount: number;
    oldestAgeMinutes?: number;
    staleOver1hCount: number;
    staleOver6hCount: number;
  };
  tokenBurn: {
    monthKey: string;
    usedTokens: number;
    includedTokens: number;
    utilizationRatePct: number;
    totalTrackedTokens: number;
    averageDailyTokens: number;
    daily: Array<{
      dayKey: string;
      totalTokens: number;
      reserveTokens: number;
      finalizeTokens: number;
      adjustTokens: number;
      eventCount: number;
    }>;
  };
};

export function clampWindowDays(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WINDOW_DAYS;
  }

  const rounded = Math.round(value);
  if (rounded < MIN_WINDOW_DAYS) return MIN_WINDOW_DAYS;
  if (rounded > MAX_WINDOW_DAYS) return MAX_WINDOW_DAYS;
  return rounded;
}

export function utcMonthKey(ts: number) {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function utcDayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

function toPercent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function resolveFailureTs(candidate: FailedCandidateRecord) {
  return candidate.sendAttemptedAt ?? candidate.reviewedAt ?? candidate.createdAt;
}

export function buildUsageDashboardMetrics(args: {
  nowTs: number;
  windowDays: number;
  monthKey: string;
  pendingTaskCreationTimes: number[];
  sends: UsageSendRecord[];
  failedCandidates: FailedCandidateRecord[];
  tokenUsageEvents: TokenUsageEventRecord[];
  monthlyUsage?: {
    usedTokens: number;
    includedTokens: number;
  };
}): UsageDashboardMetrics {
  const windowDays = clampWindowDays(args.windowDays);
  const windowStartTs = args.nowTs - windowDays * ONE_DAY_MS;

  const sendsInWindow = args.sends.filter((send) => send.sentAt >= windowStartTs);
  const successCount = sendsInWindow.length;
  const autopilotCount = sendsInWindow.filter((send) => send.sentBy === "autopilot").length;
  const ownerCount = sendsInWindow.filter((send) => send.sentBy === "owner").length;
  const ownerEditedCount = sendsInWindow.filter(
    (send) => send.sentBy === "owner_edited"
  ).length;

  const failedCount = args.failedCandidates.filter(
    (candidate) => resolveFailureTs(candidate) >= windowStartTs
  ).length;

  const attemptCount = successCount + failedCount;

  let oldestAgeMinutes: number | undefined;
  let staleOver1hCount = 0;
  let staleOver6hCount = 0;

  for (const createdAt of args.pendingTaskCreationTimes) {
    const ageMinutes = Math.max(0, Math.floor((args.nowTs - createdAt) / ONE_MINUTE_MS));
    if (oldestAgeMinutes === undefined || ageMinutes > oldestAgeMinutes) {
      oldestAgeMinutes = ageMinutes;
    }
    if (ageMinutes >= 60) staleOver1hCount += 1;
    if (ageMinutes >= 360) staleOver6hCount += 1;
  }

  const dailyMap = new Map<
    string,
    {
      dayKey: string;
      totalTokens: number;
      reserveTokens: number;
      finalizeTokens: number;
      adjustTokens: number;
      eventCount: number;
    }
  >();

  for (const event of args.tokenUsageEvents) {
    const dayKey = utcDayKey(event.createdAt);
    const existing = dailyMap.get(dayKey) ?? {
      dayKey,
      totalTokens: 0,
      reserveTokens: 0,
      finalizeTokens: 0,
      adjustTokens: 0,
      eventCount: 0
    };

    existing.totalTokens += event.totalTokens;
    existing.eventCount += 1;

    if (event.eventType === "reserve") {
      existing.reserveTokens += event.totalTokens;
    } else if (event.eventType === "finalize") {
      existing.finalizeTokens += event.totalTokens;
    } else {
      existing.adjustTokens += event.totalTokens;
    }

    dailyMap.set(dayKey, existing);
  }

  const daily = Array.from(dailyMap.values()).sort((left, right) =>
    left.dayKey.localeCompare(right.dayKey)
  );

  const totalTrackedTokens = daily.reduce((sum, row) => sum + row.totalTokens, 0);
  const usedTokens = args.monthlyUsage?.usedTokens ?? 0;
  const includedTokens = args.monthlyUsage?.includedTokens ?? 0;

  return {
    period: {
      nowTs: args.nowTs,
      monthKey: args.monthKey,
      windowDays,
      windowStartTs
    },
    sendOutcomes: {
      successCount,
      failedCount,
      attemptCount,
      successRatePct: toPercent(successCount, attemptCount),
      failureRatePct: toPercent(failedCount, attemptCount)
    },
    autoSend: {
      autopilotCount,
      ownerCount,
      ownerEditedCount,
      autoSendRatePct: toPercent(autopilotCount, successCount)
    },
    reviewBacklog: {
      pendingCount: args.pendingTaskCreationTimes.length,
      oldestAgeMinutes,
      staleOver1hCount,
      staleOver6hCount
    },
    tokenBurn: {
      monthKey: args.monthKey,
      usedTokens,
      includedTokens,
      utilizationRatePct: toPercent(usedTokens, includedTokens),
      totalTrackedTokens,
      averageDailyTokens: daily.length
        ? Number((totalTrackedTokens / daily.length).toFixed(2))
        : 0,
      daily
    }
  };
}
