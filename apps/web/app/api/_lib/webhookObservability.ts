export type WebhookProvider = "instagram" | "tiktok" | "stripe";

export interface WebhookObservabilityContext {
  provider: WebhookProvider;
  route: string;
  method: "GET" | "POST";
  startedAtMs: number;
}

const ALERT_ROUTING = {
  primary: "app-on-call",
  secondary: "infra-platform-owner",
  runbook: "docs/ops/incident-triage-escalation-flow.md"
} as const;

function elapsedMs(startedAtMs: number) {
  return Math.max(0, Date.now() - startedAtMs);
}

function emit(level: "info" | "warn", payload: Record<string, unknown>) {
  const writer = level === "warn" ? console.warn : console.info;
  writer(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload
    })
  );
}

function toAlertSeverity(statusCode: number) {
  if (statusCode >= 500) {
    return "sev2";
  }
  return "sev3";
}

export function createWebhookObservabilityContext(args: {
  provider: WebhookProvider;
  route: string;
  method: "GET" | "POST";
}): WebhookObservabilityContext {
  return {
    provider: args.provider,
    route: args.route,
    method: args.method,
    startedAtMs: Date.now()
  };
}

export function logWebhookCompleted(
  context: WebhookObservabilityContext,
  details: {
    statusCode?: number;
    accountId?: string;
    eventType?: string;
    workflowStarted?: boolean;
  } = {}
) {
  emit("info", {
    event: "webhook_observability.request_completed",
    outcome: "success",
    provider: context.provider,
    route: context.route,
    method: context.method,
    statusCode: details.statusCode ?? 200,
    durationMs: elapsedMs(context.startedAtMs),
    accountId: details.accountId,
    eventType: details.eventType,
    workflowStarted: details.workflowStarted
  });
}

export function logWebhookIgnored(
  context: WebhookObservabilityContext,
  details: {
    statusCode?: number;
    eventType?: string;
  } = {}
) {
  emit("info", {
    event: "webhook_observability.request_completed",
    outcome: "ignored",
    provider: context.provider,
    route: context.route,
    method: context.method,
    statusCode: details.statusCode ?? 200,
    durationMs: elapsedMs(context.startedAtMs),
    eventType: details.eventType
  });
}

export function logWebhookFailed(
  context: WebhookObservabilityContext,
  details: {
    statusCode: number;
    errorCode: string;
    errorMessage: string;
    accountId?: string;
    eventType?: string;
  }
) {
  emit("warn", {
    event: "webhook_observability.request_completed",
    outcome: "failure",
    provider: context.provider,
    route: context.route,
    method: context.method,
    statusCode: details.statusCode,
    durationMs: elapsedMs(context.startedAtMs),
    errorCode: details.errorCode,
    errorMessage: details.errorMessage,
    accountId: details.accountId,
    eventType: details.eventType,
    alertSeverity: toAlertSeverity(details.statusCode),
    alertRoutePrimary: ALERT_ROUTING.primary,
    alertRouteSecondary: ALERT_ROUTING.secondary,
    alertRunbook: ALERT_ROUTING.runbook
  });
}
