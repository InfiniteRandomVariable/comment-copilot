export type BillingUsageSummary = {
  monthKey: string;
  billingPlan: "free" | "paid";
  billingStatus: "active" | "past_due" | "canceled";
  usedTokens: number;
  includedTokens: number;
  warningThreshold: number;
  hardCap: number;
  overageTokens: number;
  estimatedOverageCents: number;
};

export type HealthLevel = "good" | "warning" | "critical" | "neutral";

export type HealthStatus = {
  label: string;
  level: HealthLevel;
  detail: string;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

export function resolveConnectionHealth(hasCredential: boolean): HealthStatus {
  if (!hasCredential) {
    return {
      label: "Disconnected",
      level: "critical",
      detail: "Reconnect this account to resume reply send operations."
    };
  }

  return {
    label: "Connected",
    level: "good",
    detail: "OAuth credentials are present for this account."
  };
}

export function resolveTokenHealth(tokenExpiresAt: number | undefined, nowTs = Date.now()): HealthStatus {
  if (!tokenExpiresAt) {
    return {
      label: "Unknown Expiry",
      level: "warning",
      detail: "Token expiry timestamp is missing; refresh token to verify access health."
    };
  }

  const deltaMs = tokenExpiresAt - nowTs;

  if (deltaMs <= 0) {
    return {
      label: "Expired",
      level: "critical",
      detail: "Access token has expired. Refresh token now."
    };
  }

  if (deltaMs <= 72 * ONE_HOUR_MS) {
    const hours = Math.max(1, Math.floor(deltaMs / ONE_HOUR_MS));
    return {
      label: "Expiring Soon",
      level: "warning",
      detail: `Token expires in about ${hours}h.`
    };
  }

  return {
    label: "Healthy",
    level: "good",
    detail: "Token expiry is safely beyond the next 72 hours."
  };
}

export function resolveUsageHealth(summary: BillingUsageSummary | null): HealthStatus {
  if (!summary) {
    return {
      label: "No Usage Data",
      level: "neutral",
      detail: "No billing usage summary is available for this account/month yet."
    };
  }

  if (summary.billingStatus !== "active") {
    return {
      label: "Billing Action Needed",
      level: "critical",
      detail: `Billing status is ${summary.billingStatus}. Resolve billing to avoid send interruptions.`
    };
  }

  if (summary.billingPlan === "free" && summary.usedTokens >= summary.hardCap) {
    return {
      label: "Token Cap Reached",
      level: "critical",
      detail: `Used ${summary.usedTokens} / ${summary.hardCap}. AI generation is paused until next cycle or upgrade.`
    };
  }

  if (summary.usedTokens >= summary.warningThreshold) {
    return {
      label: "Token Warning",
      level: "warning",
      detail: `Used ${summary.usedTokens} / ${summary.hardCap}. Approaching free-tier cap.`
    };
  }

  return {
    label: "Usage Healthy",
    level: "good",
    detail: `Used ${summary.usedTokens} / ${summary.hardCap} tokens in ${summary.monthKey}.`
  };
}

export function healthColor(level: HealthLevel) {
  if (level === "good") return "#0a7d40";
  if (level === "warning") return "#a16207";
  if (level === "critical") return "#9f1239";
  return "#59636e";
}
