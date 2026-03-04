"use server";

import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getConvexServerClient } from "../api/_lib/convexServer";

type Platform = "instagram" | "tiktok";

type OwnerAccount = {
  _id: string;
};

function getRequiredValue(formData: FormData, key: string) {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }
  return value;
}

function parseThreshold(formData: FormData, key: string) {
  const value = getRequiredValue(formData, key);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number between 0 and 1`);
  }
  if (parsed < 0 || parsed > 1) {
    throw new Error(`${key} must be between 0 and 1`);
  }
  return parsed;
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

export async function updateAutopilotSettingsAction(formData: FormData) {
  let updateStatus = "updated";
  let errorMessage: string | undefined;
  let accountId = "";

  try {
    accountId = getRequiredValue(formData, "accountId");
    const enabled = formData.get("enabled") === "on";
    const maxRiskScore = parseThreshold(formData, "maxRiskScore");
    const minConfidenceScore = parseThreshold(formData, "minConfidenceScore");

    const { userId } = await auth();
    if (!userId) {
      throw new Error("You must be signed in to update autopilot settings");
    }

    const client = getConvexServerClient();
    const ownerUser = (await client.query("users:getByClerkUserId" as never, {
      clerkUserId: userId
    } as never)) as { _id: string } | null;

    if (!ownerUser?._id) {
      throw new Error("Owner user record not found for this session");
    }

    const ownerAccounts = (await client.query("accounts:listOwnerAccounts" as never, {
      ownerUserId: ownerUser._id
    } as never)) as OwnerAccount[];

    if (!ownerAccounts.some((account) => account._id === accountId)) {
      throw new Error("Selected account is not owned by the current user");
    }

    await client.mutation("autopilot:upsertAutopilotSettings" as never, {
      accountId,
      enabled,
      maxRiskScore,
      minConfidenceScore
    } as never);
  } catch (error) {
    updateStatus = "error";
    errorMessage =
      error instanceof Error ? error.message : "Failed to update autopilot settings";
  }

  const params = new URLSearchParams();
  params.set("autopilot", updateStatus);
  if (accountId) {
    params.set("accountId", accountId);
  }
  if (errorMessage) {
    params.set("autopilot_error", errorMessage);
  }

  redirect(`/settings?${params.toString()}`);
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
