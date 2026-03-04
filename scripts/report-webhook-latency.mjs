#!/usr/bin/env node

import fs from "node:fs";

const TRACKED_EVENT = "webhook_observability.request_completed";

function usage() {
  console.error("Usage: node scripts/report-webhook-latency.mjs <log-file-path>");
}

function parseJsonFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function percent(numerator, denominator) {
  if (denominator <= 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function percentile(values, p) {
  if (values.length === 0) return "n/a";
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.max(0, Math.min(sorted.length - 1, rank - 1));
  return String(sorted[index]);
}

function writeSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
}

function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    usage();
    process.exit(2);
  }

  let raw = "";
  try {
    raw = fs.readFileSync(reportPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to read log file: ${message}`);
    process.exit(2);
  }

  const byRoute = new Map();
  let linesScanned = 0;
  let webhookEventsTotal = 0;
  let webhookFailureEvents = 0;

  for (const line of raw.split(/\r?\n/)) {
    linesScanned += 1;
    const parsed = parseJsonFromLine(line);
    if (!parsed || typeof parsed !== "object") continue;

    if (parsed.event !== TRACKED_EVENT) continue;

    const route = typeof parsed.route === "string" ? parsed.route : null;
    if (!route) continue;

    const outcome = typeof parsed.outcome === "string" ? parsed.outcome : "unknown";
    const durationMs =
      typeof parsed.durationMs === "number" && Number.isFinite(parsed.durationMs)
        ? Math.max(0, Math.round(parsed.durationMs))
        : null;

    webhookEventsTotal += 1;
    if (outcome === "failure") {
      webhookFailureEvents += 1;
    }

    const existing = byRoute.get(route) ?? {
      total: 0,
      failures: 0,
      durations: [],
      alertRoutePrimary: "n/a",
      alertRunbook: "n/a"
    };

    existing.total += 1;
    if (outcome === "failure") {
      existing.failures += 1;
      if (typeof parsed.alertRoutePrimary === "string") {
        existing.alertRoutePrimary = parsed.alertRoutePrimary;
      }
      if (typeof parsed.alertRunbook === "string") {
        existing.alertRunbook = parsed.alertRunbook;
      }
    }
    if (durationMs !== null) {
      existing.durations.push(durationMs);
    }

    byRoute.set(route, existing);
  }

  const reportLines = [
    "Webhook Latency Summary",
    `source: ${reportPath}`,
    `lines_scanned: ${linesScanned}`,
    `webhook_events_total: ${webhookEventsTotal}`,
    `webhook_failure_events: ${webhookFailureEvents}`,
    `routes_observed: ${byRoute.size}`
  ];

  const sortedRoutes = [...byRoute.keys()].sort((a, b) => a.localeCompare(b));
  for (const route of sortedRoutes) {
    const routeStats = byRoute.get(route);
    reportLines.push(`route.${route}.events_total: ${routeStats.total}`);
    reportLines.push(`route.${route}.failure_events: ${routeStats.failures}`);
    reportLines.push(
      `route.${route}.failure_rate: ${percent(routeStats.failures, routeStats.total)}`
    );
    reportLines.push(
      `route.${route}.latency_p50_ms: ${percentile(routeStats.durations, 50)}`
    );
    reportLines.push(
      `route.${route}.latency_p95_ms: ${percentile(routeStats.durations, 95)}`
    );
    reportLines.push(
      `route.${route}.latency_p99_ms: ${percentile(routeStats.durations, 99)}`
    );
    reportLines.push(
      `route.${route}.alert_route_primary: ${routeStats.alertRoutePrimary}`
    );
    reportLines.push(`route.${route}.alert_runbook: ${routeStats.alertRunbook}`);
  }

  console.log(reportLines.join("\n"));

  writeSummary(
    `## Webhook Latency Summary\n` +
      `- Source: \`${reportPath}\`\n` +
      `- Webhook events: ${webhookEventsTotal}\n` +
      `- Failure events: ${webhookFailureEvents} (${percent(
        webhookFailureEvents,
        webhookEventsTotal
      )})\n` +
      `- Routes observed: ${byRoute.size}`
  );
}

main();
