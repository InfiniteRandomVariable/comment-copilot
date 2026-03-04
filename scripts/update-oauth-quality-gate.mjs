#!/usr/bin/env node

import fs from "node:fs";

function usage() {
  console.error(
    "Usage: node scripts/update-oauth-quality-gate.mjs <junit-xml-path> <quality-gate-json-path> [--allow-decrease]"
  );
}

function parseTestsCount(xml) {
  const testsMatch =
    xml.match(/<testsuites\b[^>]*\btests="(\d+)"/) ??
    xml.match(/<testsuite\b[^>]*\btests="(\d+)"/);
  if (!testsMatch) return null;
  const value = Number.parseInt(testsMatch[1], 10);
  return Number.isNaN(value) ? null : value;
}

const args = process.argv.slice(2);
const allowDecrease = args.includes("--allow-decrease");
const positional = args.filter((arg) => arg !== "--allow-decrease");
const [reportPath, configPath] = positional;
if (!reportPath || !configPath) {
  usage();
  process.exit(2);
}

let xml = "";
try {
  xml = fs.readFileSync(reportPath, "utf8");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to read JUnit report at ${reportPath}: ${message}`);
  process.exit(2);
}

const tests = parseTestsCount(xml);
if (tests === null || tests < 1) {
  console.error("Could not parse a valid tests count from JUnit XML");
  process.exit(2);
}

const output = {
  minTests: tests
};

let existingMinTests = null;
if (fs.existsSync(configPath)) {
  try {
    const existingRaw = fs.readFileSync(configPath, "utf8");
    const existingJson = JSON.parse(existingRaw);
    if (typeof existingJson.minTests === "number" && Number.isInteger(existingJson.minTests)) {
      existingMinTests = existingJson.minTests;
    }
  } catch {
    // Ignore malformed existing config here; write step will replace it.
  }
}

if (
  existingMinTests !== null &&
  tests < existingMinTests &&
  !allowDecrease
) {
  console.error(
    `Refusing to decrease minTests from ${existingMinTests} to ${tests}. ` +
      "If intentional, rerun with --allow-decrease."
  );
  process.exit(1);
}

try {
  fs.writeFileSync(configPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to write quality-gate config at ${configPath}: ${message}`);
  process.exit(2);
}

const decreaseNote =
  existingMinTests !== null && tests < existingMinTests
    ? " (decrease allowed explicitly)"
    : "";
console.log(`Updated OAuth quality gate: minTests=${tests} (${configPath})${decreaseNote}`);
