import { getConvexServerClient } from "../api/_lib/convexServer";

type BillingUsageSummary = {
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

export default async function BillingPage({
  searchParams
}: {
  searchParams: Promise<{ accountId?: string; monthKey?: string }>;
}) {
  const { accountId, monthKey } = await searchParams;
  let summary: BillingUsageSummary | null = null;
  let errorMessage: string | null = null;

  if (accountId) {
    try {
      const client = getConvexServerClient();
      summary = (await client.query("billing:getUsageSummary" as never, {
        accountId,
        monthKey
      } as never)) as BillingUsageSummary;
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to load billing usage summary.";
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Billing</h1>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Usage Summary Card</h2>
        <p style={{ marginTop: 0 }}>
          Enter an account ID to load current token usage and plan status.
        </p>

        <form method="get" style={{ display: "grid", gap: 10 }}>
          <label className="label" htmlFor="accountId">
            Account ID
          </label>
          <input
            id="accountId"
            name="accountId"
            type="text"
            defaultValue={accountId ?? ""}
            placeholder="k97..."
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d8dedf",
              fontSize: 14
            }}
          />

          <label className="label" htmlFor="monthKey">
            Month Key (Optional)
          </label>
          <input
            id="monthKey"
            name="monthKey"
            type="text"
            defaultValue={monthKey ?? ""}
            placeholder="2026-03"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d8dedf",
              fontSize: 14
            }}
          />

          <button className="btn" type="submit" style={{ width: "fit-content" }}>
            Load Usage
          </button>
        </form>

        {!accountId ? (
          <p style={{ marginTop: 14, color: "#59636e" }}>
            No account selected. Run <code>devSeed:seedDefaultAccount</code> in
            Convex if your accounts table is empty.
          </p>
        ) : null}

        {errorMessage ? (
          <p style={{ marginTop: 14, color: "#9f1239" }}>
            Failed to load usage summary: {errorMessage}
          </p>
        ) : null}
      </section>

      {summary ? (
        <section className="grid grid-3">
          <article className="card">
            <div className="label">Billing Plan</div>
            <div className="value" style={{ fontSize: 20 }}>
              {summary.billingPlan}
            </div>
            <p>Status: {summary.billingStatus}</p>
          </article>

          <article className="card">
            <div className="label">Used Tokens</div>
            <div className="value" style={{ fontSize: 20 }}>
              {formatNumber(summary.usedTokens)}
            </div>
            <p>
              Included: {formatNumber(summary.includedTokens)} ({summary.monthKey})
            </p>
          </article>

          <article className="card">
            <div className="label">Estimated Overage</div>
            <div className="value" style={{ fontSize: 20 }}>
              {formatCurrencyFromCents(summary.estimatedOverageCents)}
            </div>
            <p>Overage tokens: {formatNumber(summary.overageTokens)}</p>
          </article>

          <article className="card">
            <div className="label">Warning Threshold</div>
            <div className="value" style={{ fontSize: 20 }}>
              {formatNumber(summary.warningThreshold)}
            </div>
            <p>Warning email is queued at this threshold.</p>
          </article>

          <article className="card">
            <div className="label">Hard Cap</div>
            <div className="value" style={{ fontSize: 20 }}>
              {formatNumber(summary.hardCap)}
            </div>
            <p>Free-plan generation stops if usage exceeds this cap.</p>
          </article>
        </section>
      ) : null}
    </div>
  );
}
