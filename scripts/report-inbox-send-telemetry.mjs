#!/usr/bin/env node

import fs from "node:fs";

const TRACKED_EVENTS = [
  "inbox_send.dedupe_hit",
  "inbox_send.dedupe_miss",
  "inbox_send.provider_send_succeeded",
  "inbox_send.receipt_write_succeeded",
  "inbox_send.receipt_write_failed",
  "inbox_send.fallback_reply_sent_write_succeeded",
  "inbox_send.fallback_reply_sent_write_failed",
  "inbox_send.receipt_write_failure_audited",
  "inbox_send.receipt_write_failure_audit_failed"
];

function usage() {
  console.error(
    "Usage: node scripts/report-inbox-send-telemetry.mjs <log-file-path>"
  );
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

  const counts = Object.fromEntries(TRACKED_EVENTS.map((event) => [event, 0]));
  let unmatchedInboxEvents = 0;
  let linesScanned = 0;
  let inboxEventsTotal = 0;

  for (const line of raw.split(/\r?\n/)) {
    linesScanned += 1;
    const parsed = parseJsonFromLine(line);
    if (!parsed || typeof parsed !== "object") continue;

    const event = parsed.event;
    if (typeof event !== "string" || !event.startsWith("inbox_send.")) continue;

    inboxEventsTotal += 1;
    if (Object.hasOwn(counts, event)) {
      counts[event] += 1;
    } else {
      unmatchedInboxEvents += 1;
    }
  }

  const dedupeHits = counts["inbox_send.dedupe_hit"];
  const dedupeMisses = counts["inbox_send.dedupe_miss"];
  const dedupeDecisions = dedupeHits + dedupeMisses;

  const receiptWriteSucceeded = counts["inbox_send.receipt_write_succeeded"];
  const receiptWriteFailed = counts["inbox_send.receipt_write_failed"];
  const receiptWriteAttempts = receiptWriteSucceeded + receiptWriteFailed;

  const fallbackWriteSucceeded =
    counts["inbox_send.fallback_reply_sent_write_succeeded"];
  const fallbackWriteFailed = counts["inbox_send.fallback_reply_sent_write_failed"];
  const fallbackWriteAttempts = fallbackWriteSucceeded + fallbackWriteFailed;

  const reportLines = [
    "Inbox Send Telemetry Summary",
    `source: ${reportPath}`,
    `lines_scanned: ${linesScanned}`,
    `inbox_events_total: ${inboxEventsTotal}`,
    `inbox_events_unmatched: ${unmatchedInboxEvents}`,
    `dedupe_hits: ${dedupeHits}`,
    `dedupe_misses: ${dedupeMisses}`,
    `dedupe_hit_rate: ${percent(dedupeHits, dedupeDecisions)}`,
    `provider_send_succeeded: ${counts["inbox_send.provider_send_succeeded"]}`,
    `receipt_write_succeeded: ${receiptWriteSucceeded}`,
    `receipt_write_failed: ${receiptWriteFailed}`,
    `receipt_write_failure_rate: ${percent(receiptWriteFailed, receiptWriteAttempts)}`,
    `fallback_reply_sent_write_succeeded: ${fallbackWriteSucceeded}`,
    `fallback_reply_sent_write_failed: ${fallbackWriteFailed}`,
    `fallback_reply_sent_success_rate: ${percent(
      fallbackWriteSucceeded,
      fallbackWriteAttempts
    )}`,
    `receipt_write_failure_audited: ${counts["inbox_send.receipt_write_failure_audited"]}`,
    `receipt_write_failure_audit_failed: ${counts["inbox_send.receipt_write_failure_audit_failed"]}`
  ];

  console.log(reportLines.join("\n"));

  writeSummary(
    `## Inbox Send Telemetry\n` +
      `- Source: \`${reportPath}\`\n` +
      `- Inbox events: ${inboxEventsTotal}\n` +
      `- Dedupe hit rate: ${percent(dedupeHits, dedupeDecisions)} (${dedupeHits}/${dedupeDecisions})\n` +
      `- Receipt write failure rate: ${percent(receiptWriteFailed, receiptWriteAttempts)} (${receiptWriteFailed}/${receiptWriteAttempts})\n` +
      `- Fallback write success rate: ${percent(fallbackWriteSucceeded, fallbackWriteAttempts)} (${fallbackWriteSucceeded}/${fallbackWriteAttempts})`
  );
}

main();
