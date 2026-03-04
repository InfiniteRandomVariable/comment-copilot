#!/usr/bin/env node

import fs from "node:fs";

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseCounter(xml, key) {
  const match =
    xml.match(new RegExp(`<testsuites\\b[^>]*\\b${key}="(\\d+)"`)) ??
    xml.match(new RegExp(`<testsuite\\b[^>]*\\b${key}="(\\d+)"`));
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseAttr(attrs, key) {
  const match = attrs.match(new RegExp(`${key}="([^"]*)"`));
  return match ? decodeXml(match[1]) : "";
}

function extractFailures(xml) {
  const failures = [];
  const testcaseRegex = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;
  let testcaseMatch = testcaseRegex.exec(xml);

  while (testcaseMatch) {
    const attrs = testcaseMatch[1] ?? "";
    const body = testcaseMatch[2] ?? "";
    const name = parseAttr(attrs, "name") || "Unnamed testcase";
    const classname = parseAttr(attrs, "classname") || "unknown";

    const failureTag =
      body.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/) ?? null;
    if (failureTag) {
      const kind = failureTag[1];
      const failureAttrs = failureTag[2] ?? "";
      const failureBody = (failureTag[3] ?? "").trim();
      const message = parseAttr(failureAttrs, "message");
      failures.push({
        classname,
        name,
        kind,
        message: message || decodeXml(failureBody.split("\n")[0] || "")
      });
    }

    testcaseMatch = testcaseRegex.exec(xml);
  }

  return failures;
}

function writeSummary(summaryPath, markdown) {
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${markdown}\n`, "utf8");
}

function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("Usage: node scripts/report-oauth-junit.mjs <junit-xml-path>");
    process.exit(2);
  }

  let xml = "";
  try {
    xml = fs.readFileSync(reportPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to read OAuth JUnit report: ${message}`);
    writeSummary(
      process.env.GITHUB_STEP_SUMMARY,
      `## OAuth Test Report\n- Status: report missing\n- Path: \`${reportPath}\``
    );
    return;
  }

  const tests = parseCounter(xml, "tests");
  const failures = parseCounter(xml, "failures");
  const errors = parseCounter(xml, "errors");
  const failedCases = extractFailures(xml);

  const testsText = tests === null ? "unknown" : String(tests);
  const failuresText = failures === null ? "unknown" : String(failures);
  const errorsText = errors === null ? "unknown" : String(errors);

  const header =
    `## OAuth Test Report\n` +
    `- Tests: ${testsText}\n` +
    `- Failures: ${failuresText}\n` +
    `- Errors: ${errorsText}`;
  writeSummary(process.env.GITHUB_STEP_SUMMARY, header);

  if (failedCases.length === 0) {
    writeSummary(process.env.GITHUB_STEP_SUMMARY, "- Result: no failed testcases");
    console.log(
      `OAuth JUnit report summary: tests=${testsText}, failures=${failuresText}, errors=${errorsText}, failedCases=0`
    );
    return;
  }

  const maxList = 20;
  const listed = failedCases.slice(0, maxList);
  const lines = listed.map(
    (item) =>
      `- ${item.classname} :: ${item.name} (${item.kind})` +
      (item.message ? ` - ${item.message}` : "")
  );
  const remaining = failedCases.length - listed.length;
  if (remaining > 0) {
    lines.push(`- ... and ${remaining} more`);
  }

  writeSummary(
    process.env.GITHUB_STEP_SUMMARY,
    `### Failed Testcases\n${lines.join("\n")}`
  );

  for (const item of listed) {
    const title = `OAuth test failure: ${item.name}`;
    const body = item.message || `${item.classname} (${item.kind})`;
    console.log(`::error title=${title}::${body}`);
  }

  console.log(
    `OAuth JUnit report summary: tests=${testsText}, failures=${failuresText}, errors=${errorsText}, failedCases=${failedCases.length}`
  );
}

main();
