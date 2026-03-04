import { getConvexServerClient } from "./convexServer";

export type WebhookFailurePlatform = "instagram" | "tiktok" | "stripe";

export function extractAccountIdFromRawBody(rawBody: string) {
  try {
    const parsed = JSON.parse(rawBody) as { accountId?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return undefined;

    const accountId = parsed.accountId;
    if (typeof accountId !== "string") return undefined;
    return accountId.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function enqueueWebhookFailureAlert(args: {
  platform: WebhookFailurePlatform;
  route: string;
  accountId?: string;
  error: string;
  statusCode?: number;
}) {
  if (!args.accountId) return;

  try {
    const client = getConvexServerClient();
    await client.mutation(
      "notifications:enqueueWebhookFailureAlert" as never,
      {
        accountId: args.accountId,
        platform: args.platform,
        route: args.route,
        error: args.error.slice(0, 500),
        statusCode: args.statusCode ?? 500
      } as never
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown_webhook_alert_enqueue_error";
    console.error(
      `[alerts] failed to enqueue webhook alert platform=${args.platform} route=${args.route}: ${message}`
    );
  }
}
