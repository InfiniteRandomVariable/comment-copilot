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

export type InboxFilters = {
  platform: PlatformFilter;
  intent: IntentFilter;
  q: string;
};

export type FilterableInboxItem = {
  candidate: {
    text: string;
    intentLabel?: string;
    messageId?: string;
  };
  comment: {
    text: string;
    platform: InboxPlatform;
    platformCommentId: string;
    commenterUsername?: string;
    sourceVideoTitle?: string;
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

export function normalizeInboxFilters(args: {
  platform?: string;
  intent?: string;
  q?: string;
}): InboxFilters {
  return {
    platform: normalizePlatformFilter(args.platform),
    intent: normalizeIntentFilter(args.intent),
    q: (args.q ?? "").trim()
  };
}

function resolveIntent(item: FilterableInboxItem): InboxIntent {
  const raw = item.candidate.intentLabel?.trim();
  return INBOX_INTENT_FILTER_OPTIONS.includes(raw as IntentFilter)
    ? ((raw as InboxIntent) ?? "unknown")
    : "unknown";
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

export function filterInboxItems<T extends FilterableInboxItem>(
  items: T[],
  filters: InboxFilters
): T[] {
  return items.filter((item) => {
    if (filters.platform !== "all" && item.comment.platform !== filters.platform) {
      return false;
    }

    const intent = resolveIntent(item);
    if (filters.intent !== "all" && intent !== filters.intent) {
      return false;
    }

    return matchesSearch(item, filters.q);
  });
}

export function summarizeInboxQueue(items: FilterableInboxItem[]) {
  const byPlatform = {
    instagram: 0,
    tiktok: 0
  };
  const byIntentCount = new Map<InboxIntent, number>();

  for (const item of items) {
    byPlatform[item.comment.platform] += 1;
    const intent = resolveIntent(item);
    byIntentCount.set(intent, (byIntentCount.get(intent) ?? 0) + 1);
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
    byIntent
  };
}
