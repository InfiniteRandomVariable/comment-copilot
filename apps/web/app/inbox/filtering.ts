export type InboxPlatform = "instagram" | "tiktok";

export type InboxIntent =
  | "question"
  | "praise"
  | "objection"
  | "troll"
  | "purchase_intent"
  | "support_request"
  | "unknown";

export type PlatformFilter = "all" | InboxPlatform;
export type IntentFilter = "all" | InboxIntent;
export type AgeBandFilter = "all" | "stale_1h" | "stale_6h";

export const INBOX_PLATFORM_FILTER_OPTIONS: PlatformFilter[] = [
  "all",
  "instagram",
  "tiktok"
];

export const INBOX_INTENT_FILTER_OPTIONS: IntentFilter[] = [
  "all",
  "question",
  "praise",
  "objection",
  "troll",
  "purchase_intent",
  "support_request",
  "unknown"
];

export const INBOX_AGE_BAND_FILTER_OPTIONS: AgeBandFilter[] = [
  "all",
  "stale_1h",
  "stale_6h"
];

export type InboxFilters = {
  platform: PlatformFilter;
  intent: IntentFilter;
  ageBand: AgeBandFilter;
  q: string;
};

export type FilterableInboxItem = {
  candidate: {
    text: string;
    intentLabel?: string;
    messageId?: string;
    createdAt?: number;
  };
  comment: {
    text: string;
    platform: InboxPlatform;
    platformCommentId: string;
    commenterUsername?: string;
    sourceVideoTitle?: string;
  };
};

export type InboxQueueSummary = {
  total: number;
  byPlatform: {
    instagram: number;
    tiktok: number;
  };
  byIntent: Array<{ intent: InboxIntent; count: number }>;
  queueAge: {
    oldestAgeMinutes?: number;
    staleOver1hCount: number;
    staleOver6hCount: number;
  };
};

function normalizePlatformFilter(value?: string): PlatformFilter {
  return INBOX_PLATFORM_FILTER_OPTIONS.includes(value as PlatformFilter)
    ? (value as PlatformFilter)
    : "all";
}

function normalizeIntentFilter(value?: string): IntentFilter {
  return INBOX_INTENT_FILTER_OPTIONS.includes(value as IntentFilter)
    ? (value as IntentFilter)
    : "all";
}

function normalizeAgeBandFilter(value?: string): AgeBandFilter {
  return INBOX_AGE_BAND_FILTER_OPTIONS.includes(value as AgeBandFilter)
    ? (value as AgeBandFilter)
    : "all";
}

export function normalizeInboxFilters(args: {
  platform?: string;
  intent?: string;
  ageBand?: string;
  q?: string;
}): InboxFilters {
  return {
    platform: normalizePlatformFilter(args.platform),
    intent: normalizeIntentFilter(args.intent),
    ageBand: normalizeAgeBandFilter(args.ageBand),
    q: (args.q ?? "").trim()
  };
}

function resolveIntent(item: FilterableInboxItem): InboxIntent {
  const raw = item.candidate.intentLabel?.trim();
  return INBOX_INTENT_FILTER_OPTIONS.includes(raw as IntentFilter)
    ? ((raw as InboxIntent) ?? "unknown")
    : "unknown";
}

function resolveAgeMinutes(item: FilterableInboxItem, nowTs: number) {
  if (
    typeof item.candidate.createdAt !== "number" ||
    !Number.isFinite(item.candidate.createdAt)
  ) {
    return undefined;
  }

  return Math.max(0, Math.floor((nowTs - item.candidate.createdAt) / 60000));
}

function matchesSearch(item: FilterableInboxItem, q: string) {
  if (!q) return true;

  const query = q.toLowerCase();
  const fields = [
    item.comment.text,
    item.candidate.text,
    item.comment.commenterUsername,
    item.comment.sourceVideoTitle,
    item.comment.platformCommentId,
    item.candidate.messageId
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return fields.some((value) => value.includes(query));
}

function matchesAgeBand(item: FilterableInboxItem, ageBand: AgeBandFilter, nowTs: number) {
  if (ageBand === "all") {
    return true;
  }

  const ageMinutes = resolveAgeMinutes(item, nowTs);
  if (typeof ageMinutes !== "number") {
    return false;
  }

  if (ageBand === "stale_6h") {
    return ageMinutes >= 360;
  }

  return ageMinutes >= 60;
}

export function filterInboxItems<T extends FilterableInboxItem>(
  items: T[],
  filters: InboxFilters,
  nowTs = Date.now()
): T[] {
  return items.filter((item) => {
    if (filters.platform !== "all" && item.comment.platform !== filters.platform) {
      return false;
    }

    const intent = resolveIntent(item);
    if (filters.intent !== "all" && intent !== filters.intent) {
      return false;
    }

    if (!matchesAgeBand(item, filters.ageBand, nowTs)) {
      return false;
    }

    return matchesSearch(item, filters.q);
  });
}

export function summarizeInboxQueue(
  items: FilterableInboxItem[],
  nowTs = Date.now()
): InboxQueueSummary {
  const byPlatform = {
    instagram: 0,
    tiktok: 0
  };
  const byIntentCount = new Map<InboxIntent, number>();
  let oldestAgeMinutes: number | undefined;
  let staleOver1hCount = 0;
  let staleOver6hCount = 0;

  for (const item of items) {
    byPlatform[item.comment.platform] += 1;
    const intent = resolveIntent(item);
    byIntentCount.set(intent, (byIntentCount.get(intent) ?? 0) + 1);

    const ageMinutes = resolveAgeMinutes(item, nowTs);
    if (typeof ageMinutes === "number") {
      if (typeof oldestAgeMinutes !== "number" || ageMinutes > oldestAgeMinutes) {
        oldestAgeMinutes = ageMinutes;
      }
      if (ageMinutes >= 60) {
        staleOver1hCount += 1;
      }
      if (ageMinutes >= 360) {
        staleOver6hCount += 1;
      }
    }
  }

  const byIntent = Array.from(byIntentCount.entries())
    .map(([intent, count]) => ({ intent, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.intent.localeCompare(right.intent);
    });

  return {
    total: items.length,
    byPlatform,
    byIntent,
    queueAge: {
      oldestAgeMinutes,
      staleOver1hCount,
      staleOver6hCount
    }
  };
}
