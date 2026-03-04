const ERROR_TRACKING_TIMEOUT_MS = 1500;

type ErrorTrackingArgs = {
  source: string;
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
};

function getWebhookUrl() {
  const url = process.env.ERROR_TRACKING_WEBHOOK_URL;
  if (!url) return undefined;
  return url.trim() || undefined;
}

export async function reportErrorTrackingEvent(args: ErrorTrackingArgs) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  const payload = {
    source: args.source,
    category: args.category,
    message: args.message.slice(0, 1000),
    metadata: args.metadata ?? {},
    capturedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "unknown"
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ERROR_TRACKING_TIMEOUT_MS);

  try {
    const token = process.env.ERROR_TRACKING_WEBHOOK_TOKEN;

    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : `${error}`;
    console.error(`[error-tracking] failed to report event: ${err}`);
  } finally {
    clearTimeout(timeout);
  }
}
