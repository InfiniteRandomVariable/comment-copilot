#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, ".env.local");
const targetPath = path.join(repoRoot, "apps/web/.env.local");

if (!fs.existsSync(sourcePath)) {
  if (fs.existsSync(targetPath)) {
    console.warn(
      `[sync:web:env] source file not found: ${sourcePath}. Using existing ${targetPath}.`
    );
    process.exit(0);
  }

  console.error(
    `[sync:web:env] source file not found: ${sourcePath}\n` +
      "Create .env.local first (for example from .env.example)."
  );
  process.exit(1);
}

const sourceContent = fs.readFileSync(sourcePath, "utf8");
const normalizedContent = sourceContent.endsWith("\n")
  ? sourceContent
  : `${sourceContent}\n`;
const existingTarget = fs.existsSync(targetPath)
  ? fs.readFileSync(targetPath, "utf8")
  : "";

if (existingTarget === normalizedContent) {
  console.log("[sync:web:env] apps/web/.env.local is already in sync.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, normalizedContent, "utf8");

console.log(`[sync:web:env] synced ${sourcePath} -> ${targetPath}`);
