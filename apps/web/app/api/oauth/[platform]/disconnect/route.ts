import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getConvexServerClient } from "../../../_lib/convexServer";
import { unsealToken } from "../../../_lib/tokenVault";
import {
  createOAuthDisconnectPostHandler,
  type OAuthDisconnectDeps
} from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function revokeTiktokAccessToken(accessToken: string) {
  const clientKey = getRequiredEnv("TIKTOK_CLIENT_KEY");
  const clientSecret = getRequiredEnv("TIKTOK_CLIENT_SECRET");
  const revokeBody = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken
  });

  const revokeResponse = await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: revokeBody.toString(),
    cache: "no-store"
  });

  if (!revokeResponse.ok) {
    const bodyText = await revokeResponse.text();
    throw new Error(`TikTok revoke failed (${revokeResponse.status}): ${bodyText}`);
  }
}

const deps: OAuthDisconnectDeps = {
  auth,
  getConvexServerClient,
  unsealToken,
  revokeTiktokAccessToken
};

const handlePost = createOAuthDisconnectPostHandler(deps);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  return handlePost(request, context);
}
