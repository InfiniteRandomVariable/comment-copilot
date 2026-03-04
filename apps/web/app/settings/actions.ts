"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

type Platform = "instagram" | "tiktok";

function getRequiredValue(formData: FormData, key: string) {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }
  return value;
}

async function getAppOrigin() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3100";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

function normalizePlatform(value: string): Platform {
  if (value === "instagram" || value === "tiktok") {
    return value;
  }
  throw new Error(`Unsupported platform: ${value}`);
}

export async function refreshSocialTokenAction(formData: FormData) {
  const accountId = getRequiredValue(formData, "accountId");
  const platform = normalizePlatform(getRequiredValue(formData, "platform"));

  let refreshStatus = "success";
  let errorMessage: string | undefined;

  try {
    const origin = await getAppOrigin();
    const requestHeaders = await headers();
    const cookie = requestHeaders.get("cookie");
    const response = await fetch(`${origin}/api/oauth/${platform}/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify({ accountId }),
      cache: "no-store"
    });

    const responseJson = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!response.ok || !responseJson?.ok) {
      throw new Error(
        responseJson?.error || `Refresh failed with status ${response.status}`
      );
    }
  } catch (error) {
    refreshStatus = "error";
    errorMessage = error instanceof Error ? error.message : "Token refresh failed";
  }

  const params = new URLSearchParams();
  params.set("refresh", refreshStatus);
  params.set("platform", platform);
  params.set("accountId", accountId);
  if (errorMessage) {
    params.set("refresh_error", errorMessage);
  }

  redirect(`/settings?${params.toString()}`);
}

export async function disconnectSocialAccessAction(formData: FormData) {
  const accountId = getRequiredValue(formData, "accountId");
  const platform = normalizePlatform(getRequiredValue(formData, "platform"));

  let disconnectStatus = "success";
  let errorMessage: string | undefined;

  try {
    const origin = await getAppOrigin();
    const requestHeaders = await headers();
    const cookie = requestHeaders.get("cookie");
    const response = await fetch(`${origin}/api/oauth/${platform}/disconnect`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify({ accountId }),
      cache: "no-store"
    });

    const responseJson = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!response.ok || !responseJson?.ok) {
      throw new Error(
        responseJson?.error || `Disconnect failed with status ${response.status}`
      );
    }
  } catch (error) {
    disconnectStatus = "error";
    errorMessage = error instanceof Error ? error.message : "Disconnect failed";
  }

  const params = new URLSearchParams();
  params.set("disconnect", disconnectStatus);
  params.set("platform", platform);
  params.set("accountId", accountId);
  if (errorMessage) {
    params.set("disconnect_error", errorMessage);
  }

  redirect(`/settings?${params.toString()}`);
}
