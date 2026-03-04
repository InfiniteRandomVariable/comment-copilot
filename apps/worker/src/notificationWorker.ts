import { ConvexHttpClient } from "convex/browser";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { getConvexUrlOrThrow, loadWorkerEnv } from "./env";

loadWorkerEnv();

const POLL_MS = Number(process.env.NOTIFICATION_POLL_MS ?? "5000");
const MAX_ATTEMPTS = Number(process.env.NOTIFICATION_MAX_ATTEMPTS ?? "5");
const DELIVERY_MODE = (process.env.NOTIFICATION_DELIVERY_MODE ?? "log").toLowerCase();
const SES_REGION = process.env.SES_REGION;
const SES_FROM_EMAIL =
  process.env.SES_FROM_EMAIL ?? process.env.NOTIFICATION_FROM_EMAIL;

type ClaimedNotification = {
  notificationId: string;
  accountId: string;
  monthKey: string;
  eventType:
    | "token_warning_threshold"
    | "token_free_tier_cap_reached"
    | "token_40k_warning"
    | "token_50k_cap_reached";
  payloadJson: string;
  recipientEmail: string;
  recipientName?: string;
};

const DEFAULT_WARNING_THRESHOLD = 8_000;
const DEFAULT_HARD_CAP = 10_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConvexClient() {
  return new ConvexHttpClient(getConvexUrlOrThrow("notification worker"));
}

let sesClient: SESv2Client | null = null;
function getSesClient() {
  if (!SES_REGION) {
    throw new Error("SES_REGION is required for ses mode");
  }

  if (!sesClient) {
    sesClient = new SESv2Client({ region: SES_REGION });
  }

  return sesClient;
}

function asNumberOrDefault(value: unknown, fallback: number) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildMessage(event: ClaimedNotification) {
  const payload = safeParseJson(event.payloadJson);
  const warningThreshold = asNumberOrDefault(
    payload.warningThreshold,
    DEFAULT_WARNING_THRESHOLD
  );
  const hardCap = asNumberOrDefault(payload.includedTokens, DEFAULT_HARD_CAP);
  const projectedUsage = payload.projectedUsage ?? "n/a";

  if (
    event.eventType === "token_warning_threshold" ||
    event.eventType === "token_40k_warning"
  ) {
    return {
      subject: `Usage warning: ${warningThreshold.toLocaleString("en-US")} token threshold reached`,
      text: [
        `Hi ${event.recipientName ?? "there"},`,
        "",
        `Your account has crossed the ${warningThreshold.toLocaleString("en-US")} monthly token warning threshold.`,
        `Month: ${event.monthKey}`,
        `Projected usage: ${projectedUsage}`,
        "",
        `Please review usage to avoid free-tier interruption at ${hardCap.toLocaleString("en-US")} tokens.`,
        ""
      ].join("\n")
    };
  }

  return {
    subject: "Action required: free-tier token cap reached",
    text: [
      `Hi ${event.recipientName ?? "there"},`,
      "",
      `Your account reached the ${hardCap.toLocaleString("en-US")} monthly free-tier token cap.`,
      `Month: ${event.monthKey}`,
      "",
      "AI generation is paused until billing is upgraded or the next monthly cycle starts.",
      ""
    ].join("\n")
  };
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function sendNotificationEmail(event: ClaimedNotification) {
  const message = buildMessage(event);

  if (DELIVERY_MODE === "log") {
    console.log(
      `[notification] LOG mode -> ${event.recipientEmail} | ${message.subject}`
    );
    return;
  }

  if (DELIVERY_MODE === "ses") {
    if (!SES_FROM_EMAIL) {
      throw new Error("SES_FROM_EMAIL (or NOTIFICATION_FROM_EMAIL) is required");
    }

    const client = getSesClient();
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [event.recipientEmail]
        },
        Content: {
          Simple: {
            Subject: { Data: message.subject },
            Body: { Text: { Data: message.text } }
          }
        }
      })
    );
    return;
  }

  if (DELIVERY_MODE !== "resend") {
    throw new Error(
      `Unsupported NOTIFICATION_DELIVERY_MODE: ${DELIVERY_MODE}. Expected log|resend|ses`
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL;

  if (!resendApiKey || !fromEmail) {
    throw new Error("RESEND_API_KEY and NOTIFICATION_FROM_EMAIL are required");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [event.recipientEmail],
      subject: message.subject,
      text: message.text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${body}`);
  }
}

function isRetryableError(error: unknown) {
  const message = error instanceof Error ? error.message : `${error}`;

  if (
    message.includes("required") ||
    message.includes("Missing credentials") ||
    message.includes("Unsupported NOTIFICATION_DELIVERY_MODE")
  ) {
    return false;
  }

  return true;
}

async function runNotificationWorker() {
  const client = getConvexClient();

  console.log(
    `[notification] worker started. mode=${DELIVERY_MODE} pollMs=${POLL_MS}`
  );

  while (true) {
    try {
      const claimed = (await client.mutation(
        "notifications:claimNextPendingNotification" as never,
        {
          maxAttempts: MAX_ATTEMPTS
        } as never
      )) as ClaimedNotification | null;

      if (!claimed) {
        await sleep(POLL_MS);
        continue;
      }

      try {
        await sendNotificationEmail(claimed);
        await client.mutation(
          "notifications:markNotificationSent" as never,
          {
            notificationId: claimed.notificationId
          } as never
        );
      } catch (error) {
        const retry = isRetryableError(error);
        const message = error instanceof Error ? error.message : `${error}`;

        await client.mutation(
          "notifications:markNotificationFailed" as never,
          {
            notificationId: claimed.notificationId,
            error: message,
            retry
          } as never
        );

        console.error(
          `[notification] failed (${retry ? "retry" : "no-retry"}): ${message}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error}`;
      console.error(`[notification] loop error: ${message}`);
      await sleep(POLL_MS);
    }
  }
}

runNotificationWorker().catch((error) => {
  console.error("Notification worker failed", error);
  process.exit(1);
});
