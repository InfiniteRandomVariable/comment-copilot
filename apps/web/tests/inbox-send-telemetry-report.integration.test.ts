import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const telemetryScriptPath = fileURLToPath(
  new URL("../../../scripts/report-inbox-send-telemetry.mjs", import.meta.url)
);

function parseSummary(stdout: string) {
  const result = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    result.set(key, value);
  }
  return result;
}

describe("Inbox Send Telemetry Reporter Script", () => {
  it("summarizes dedupe and fallback metrics from mixed log lines", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-telemetry-test-"));
    const logPath = path.join(tmpDir, "inbox.log");
    fs.writeFileSync(
      logPath,
      [
        '{"event":"inbox_send.dedupe_miss","candidateId":"cand_1"}',
        '{"event":"inbox_send.provider_send_succeeded","candidateId":"cand_1"}',
        '{"event":"inbox_send.receipt_write_failed","candidateId":"cand_1"}',
        '{"event":"inbox_send.fallback_reply_sent_write_succeeded","candidateId":"cand_1"}',
        '{"event":"inbox_send.receipt_write_failure_audited","candidateId":"cand_1"}',
        '{"event":"inbox_send.dedupe_hit","candidateId":"cand_1"}',
        '{"event":"inbox_send.unknown_event","candidateId":"cand_1"}',
        '2026-03-03T04:00:00Z INFO {"event":"inbox_send.dedupe_hit","candidateId":"cand_2"}',
        "noise line"
      ].join("\n"),
      "utf8"
    );

    const stdout = execFileSync(process.execPath, [telemetryScriptPath, logPath], {
      encoding: "utf8"
    });
    const summary = parseSummary(stdout);

    assert.equal(summary.get("inbox_events_total"), "8");
    assert.equal(summary.get("inbox_events_unmatched"), "1");
    assert.equal(summary.get("dedupe_hits"), "2");
    assert.equal(summary.get("dedupe_misses"), "1");
    assert.equal(summary.get("dedupe_hit_rate"), "66.67%");
    assert.equal(summary.get("receipt_write_failed"), "1");
    assert.equal(summary.get("fallback_reply_sent_write_succeeded"), "1");
    assert.equal(summary.get("fallback_reply_sent_success_rate"), "100.00%");
  });

  it("returns usage error when log path arg is missing", () => {
    const result = spawnSync(process.execPath, [telemetryScriptPath], {
      encoding: "utf8"
    });

    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /Usage: node scripts\/report-inbox-send-telemetry\.mjs <log-file-path>/
    );
  });
});
