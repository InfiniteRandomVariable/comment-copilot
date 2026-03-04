#!/usr/bin/env node

import fs from "node:fs";

function usage() {
  console.error(
    "Usage: node scripts/verify-oauth-junit.mjs <junit-xml-path> [min-test-count] [--config <json-path>]"
  );
}

function parseCliArgs(args) {
  const parsed = {
    reportPath: "",
    minTestsRaw: undefined,
    configPath: undefined
  };

  if (args.length === 0) {
    return parsed;
  }

  parsed.reportPath = args[0];
  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--config") {
      parsed.configPath = args[i + 1];
      i += 2;
      continue;
    }
    if (parsed.minTestsRaw === undefined) {
      parsed.minTestsRaw = arg;
      i += 1;
      continue;
    }
    console.error(`Unexpected argument: ${arg}`);
    usage();
    process.exit(2);
  }

  return parsed;
}

function readMinTestsFromConfig(configPath) {
  if (!configPath) return undefined;

  let raw = "";
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read quality-gate config at ${configPath}: ${message}`);
    process.exit(2);
  }

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Invalid JSON in quality-gate config ${configPath}: ${message}`);
    process.exit(2);
  }

  const value = json?.minTests;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    console.error(
      `Invalid minTests in quality-gate config ${configPath}: expected positive integer`
    );
    process.exit(2);
  }

  return value;
}

const { reportPath, minTestsRaw, configPath } = parseCliArgs(process.argv.slice(2));
if (!reportPath) {
  usage();
  process.exit(2);
}

const minFromConfig = readMinTestsFromConfig(configPath);
const minTests = minTestsRaw
  ? Number.parseInt(minTestsRaw, 10)
  : minFromConfig ?? 1;
if (Number.isNaN(minTests) || minTests < 1) {
  console.error(`Invalid min-test-count: ${minTestsRaw}`);
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

const testsMatch =
  xml.match(/<testsuites\b[^>]*\btests="(\d+)"/) ??
  xml.match(/<testsuite\b[^>]*\btests="(\d+)"/);
const failuresMatch =
  xml.match(/<testsuites\b[^>]*\bfailures="(\d+)"/) ??
  xml.match(/<testsuite\b[^>]*\bfailures="(\d+)"/);
const errorsMatch =
  xml.match(/<testsuites\b[^>]*\berrors="(\d+)"/) ??
  xml.match(/<testsuite\b[^>]*\berrors="(\d+)"/);

if (!testsMatch || !failuresMatch || !errorsMatch) {
  console.error("Could not parse tests/failures/errors from JUnit XML");
  process.exit(2);
}

const tests = Number.parseInt(testsMatch[1], 10);
const failures = Number.parseInt(failuresMatch[1], 10);
const errors = Number.parseInt(errorsMatch[1], 10);

if (Number.isNaN(tests) || Number.isNaN(failures) || Number.isNaN(errors)) {
  console.error("Parsed non-numeric JUnit counters");
  process.exit(2);
}

if (tests < minTests) {
  console.error(`Expected at least ${minTests} tests, but found ${tests}`);
  process.exit(1);
}

if (failures > 0 || errors > 0) {
  console.error(
    `OAuth test report contains failures/errors (failures=${failures}, errors=${errors})`
  );
  process.exit(1);
}

console.log(
  `OAuth JUnit quality gate passed: tests=${tests}, failures=${failures}, errors=${errors}, min=${minTests}`
);
