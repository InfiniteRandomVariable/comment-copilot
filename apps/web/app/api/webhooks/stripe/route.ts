import { NextRequest, NextResponse } from "next/server";
import { getConvexServerClient } from "../../_lib/convexServer";
import {
  createWebhookObservabilityContext,
  logWebhookCompleted,
  logWebhookFailed,
  logWebhookIgnored
} from "../../_lib/webhookObservability";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapSubscriptionStatusToBilling(
  status: Stripe.Subscription.Status
): { planType: "free" | "paid"; billingStatus: "active" | "past_due" | "canceled" } {
  if (status === "past_due" || status === "unpaid") {
    return { planType: "paid", billingStatus: "past_due" };
  }

  if (status === "canceled" || status === "incomplete_expired") {
    return { planType: "free", billingStatus: "canceled" };
  }

  return { planType: "paid", billingStatus: "active" };
}

export async function POST(request: NextRequest) {
  const observability = createWebhookObservabilityContext({
    provider: "stripe",
    route: "/api/webhooks/stripe",
    method: "POST"
  });

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      const errorMessage = "Missing Stripe webhook environment variables";
      logWebhookFailed(observability, {
        statusCode: 500,
        errorCode: "stripe_webhook_env_missing",
        errorMessage
      });
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      const errorMessage = "Missing Stripe signature header";
      logWebhookFailed(observability, {
        statusCode: 400,
        errorCode: "stripe_signature_missing",
        errorMessage
      });
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
    }

    const stripe = new Stripe(stripeSecretKey);
    const rawBody = await request.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid Stripe signature";
      logWebhookFailed(observability, {
        statusCode: 400,
        errorCode: "stripe_signature_invalid",
        errorMessage: message
      });
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    let accountId: string | undefined;
    let stripeCustomerId: string | undefined;
    let stripeSubscriptionId: string | undefined;
    let planType: "free" | "paid" | undefined;
    let billingStatus: "active" | "past_due" | "canceled" | undefined;

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        accountId = subscription.metadata?.accountId;
        stripeCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        stripeSubscriptionId = subscription.id;
        ({ planType, billingStatus } = mapSubscriptionStatusToBilling(
          subscription.status
        ));
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        accountId = invoice.lines?.data?.[0]?.metadata?.accountId;
        stripeCustomerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        stripeSubscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        planType = "paid";
        billingStatus = "past_due";
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        accountId = invoice.lines?.data?.[0]?.metadata?.accountId;
        stripeCustomerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        stripeSubscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        planType = stripeSubscriptionId ? "paid" : "free";
        billingStatus = stripeSubscriptionId ? "active" : "canceled";
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        accountId = session.metadata?.accountId;
        stripeCustomerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        stripeSubscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        planType = stripeSubscriptionId ? "paid" : "free";
        billingStatus = stripeSubscriptionId ? "active" : "canceled";
        break;
      }
      default:
        logWebhookIgnored(observability, {
          eventType: event.type
        });
        return NextResponse.json({ ok: true, ignored: true, type: event.type });
    }

    if (!planType || !billingStatus) {
      logWebhookIgnored(observability, {
        eventType: event.type
      });
      return NextResponse.json({ ok: true, ignored: true, type: event.type });
    }

    const client = getConvexServerClient();

    const result = await client.mutation(
      "billing:processStripeBillingEvent" as never,
      {
        eventId: event.id,
        eventType: event.type,
        accountId,
        stripeCustomerId,
        stripeSubscriptionId,
        planType,
        billingStatus,
        payloadJson: JSON.stringify({
          livemode: event.livemode,
          created: event.created
        })
      } as never
    );

    logWebhookCompleted(observability, {
      accountId,
      eventType: event.type
    });

    return NextResponse.json({
      ok: true,
      processed: true,
      result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logWebhookFailed(observability, {
      statusCode: 500,
      errorCode: "stripe_webhook_processing_failed",
      errorMessage: message
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
