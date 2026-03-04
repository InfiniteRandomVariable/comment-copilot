import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function loadWorkerEnv() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRootFromModule = path.resolve(moduleDir, "../../..");

  const candidates = [
    path.resolve(repoRootFromModule, ".env.local"),
    path.resolve(repoRootFromModule, ".env"),
    path.resolve(repoRootFromModule, "apps/web/.env.local"),
    path.resolve(repoRootFromModule, "apps/worker/.env.local"),
    path.resolve(process.cwd(), "../../.env.local"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../../apps/web/.env.local"),
    path.resolve(process.cwd(), "./.env.local"),
    path.resolve(process.cwd(), "./.env")
  ];

  for (const candidate of candidates) {
    loadEnvFile(candidate);
  }
}

export function getConvexUrlOrThrow(context: string) {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      `CONVEX_URL is not set for ${context} (fallback NEXT_PUBLIC_CONVEX_URL also missing)`
    );
  }
  return url;
}
