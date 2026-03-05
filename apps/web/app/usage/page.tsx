import { getConvexServerClient } from "../api/_lib/convexServer";

type UsageDashboardSummary = {
  period: {
    monthKey: string;
    windowDays: number;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatAgeMinutes(minutes?: number) {
  if (typeof minutes !== "number") {
    return "N/A";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!remainingMinutes) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function parseWindowDays(value?: string) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function UsagePage({
  searchParams
}: {
  searchParams: Promise<{ accountId?: string; monthKey?: string; windowDays?: string }>;
}) {
  const { accountId, monthKey, windowDays: windowDaysParam } = await searchParams;

  let summary: UsageDashboardSummary | null = null;
  let errorMessage: string | null = null;

  const parsedWindowDays = parseWindowDays(windowDaysParam);

  if (accountId) {
    try {
      const client = getConvexServerClient();
      summary = (await client.query("usageDashboard:getUsageDashboard" as never, {
        accountId,
        monthKey,
        windowDays: parsedWindowDays
      } as never)) as UsageDashboardSummary;
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : "Unable to load usage dashboard summary.";
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Usage Dashboard</h1>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Metrics Scope</h2>
        <p style={{ marginTop: 0 }}>
          Track auto-send rate, send success/failure, review backlog age, and token burn trends.
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

          <label className="label" htmlFor="windowDays">
            Send Window Days
          </label>
          <input
            id="windowDays"
            name="windowDays"
            type="number"
            min={1}
            max={90}
            defaultValue={windowDaysParam ?? "14"}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d8dedf",
              fontSize: 14,
              width: 140
            }}
          />

          <button className="btn" type="submit" style={{ width: "fit-content" }}>
            Load Metrics
          </button>
        </form>

        {!accountId ? (
          <p style={{ marginTop: 14, color: "#59636e" }}>
            No account selected. Run <code>devSeed:seedDefaultAccount</code> in Convex if your
            accounts table is empty.
          </p>
        ) : null}

        {errorMessage ? (
          <p style={{ marginTop: 14, color: "#9f1239" }}>
            Failed to load usage dashboard: {errorMessage}
          </p>
        ) : null}
      </section>

      {summary ? (
        <>
          <section className="grid grid-3">
            <article className="card">
              <div className="label">Auto-Send Rate</div>
              <div className="value" style={{ fontSize: 20 }}>
                {formatPct(summary.autoSend.autoSendRatePct)}
              </div>
              <p style={{ marginBottom: 0 }}>
                {formatNumber(summary.autoSend.autopilotCount)} autopilot /{" "}
                {formatNumber(summary.sendOutcomes.successCount)} successful sends
              </p>
            </article>

            <article className="card">
              <div className="label">Send Success Rate</div>
              <div className="value" style={{ fontSize: 20 }}>
                {formatPct(summary.sendOutcomes.successRatePct)}
              </div>
              <p style={{ marginBottom: 0 }}>
                {formatNumber(summary.sendOutcomes.failedCount)} failures in last{" "}
                {summary.period.windowDays} days
              </p>
            </article>

            <article className="card">
              <div className="label">Review Backlog</div>
              <div className="value" style={{ fontSize: 20 }}>
                {formatNumber(summary.reviewBacklog.pendingCount)}
              </div>
              <p style={{ marginBottom: 0 }}>
                Oldest pending age: {formatAgeMinutes(summary.reviewBacklog.oldestAgeMinutes)}
              </p>
            </article>

            <article className="card">
              <div className="label">Token Utilization</div>
              <div className="value" style={{ fontSize: 20 }}>
                {formatPct(summary.tokenBurn.utilizationRatePct)}
              </div>
              <p style={{ marginBottom: 0 }}>
                {formatNumber(summary.tokenBurn.usedTokens)} /{" "}
                {formatNumber(summary.tokenBurn.includedTokens)} tokens ({summary.tokenBurn.monthKey})
              </p>
            </article>

            <article className="card">
              <div className="label">Tracked Token Burn</div>
              <div className="value" style={{ fontSize: 20 }}>
                {formatNumber(summary.tokenBurn.totalTrackedTokens)}
              </div>
              <p style={{ marginBottom: 0 }}>
                Avg/day: {formatNumber(summary.tokenBurn.averageDailyTokens)}
              </p>
            </article>

            <article className="card">
              <div className="label">Backlog Staleness</div>
              <div className="value" style={{ fontSize: 20 }}>
                {formatNumber(summary.reviewBacklog.staleOver1hCount)} /{" "}
                {formatNumber(summary.reviewBacklog.staleOver6hCount)}
              </div>
              <p style={{ marginBottom: 0 }}>Stale over 1h / stale over 6h</p>
            </article>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Send Outcomes ({summary.period.windowDays}-Day Window)</h2>
            <ul style={{ marginBottom: 0 }}>
              <li>Successful sends: {formatNumber(summary.sendOutcomes.successCount)}</li>
              <li>Failed sends: {formatNumber(summary.sendOutcomes.failedCount)}</li>
              <li>Attempt count: {formatNumber(summary.sendOutcomes.attemptCount)}</li>
              <li>Failure rate: {formatPct(summary.sendOutcomes.failureRatePct)}</li>
              <li>Owner sends: {formatNumber(summary.autoSend.ownerCount)}</li>
              <li>Owner edited sends: {formatNumber(summary.autoSend.ownerEditedCount)}</li>
            </ul>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Token Burn Trend ({summary.tokenBurn.monthKey})</h2>
            {summary.tokenBurn.daily.length ? (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #d8dedf", padding: 8 }}>
                        Day
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #d8dedf", padding: 8 }}>
                        Total Tokens
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #d8dedf", padding: 8 }}>
                        Reserve
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #d8dedf", padding: 8 }}>
                        Finalize
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #d8dedf", padding: 8 }}>
                        Adjust
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #d8dedf", padding: 8 }}>
                        Events
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.tokenBurn.daily.map((row) => (
                      <tr key={row.dayKey}>
                        <td style={{ padding: 8, borderBottom: "1px solid #eef2f3" }}>{row.dayKey}</td>
                        <td
                          style={{
                            padding: 8,
                            textAlign: "right",
                            borderBottom: "1px solid #eef2f3"
                          }}
                        >
                          {formatNumber(row.totalTokens)}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            textAlign: "right",
                            borderBottom: "1px solid #eef2f3"
                          }}
                        >
                          {formatNumber(row.reserveTokens)}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            textAlign: "right",
                            borderBottom: "1px solid #eef2f3"
                          }}
                        >
                          {formatNumber(row.finalizeTokens)}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            textAlign: "right",
                            borderBottom: "1px solid #eef2f3"
                          }}
                        >
                          {formatNumber(row.adjustTokens)}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            textAlign: "right",
                            borderBottom: "1px solid #eef2f3"
                          }}
                        >
                          {formatNumber(row.eventCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ marginBottom: 0, color: "#59636e" }}>
                No token usage events recorded for this month yet.
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
