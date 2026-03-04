import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getConvexServerClient } from "../../../_lib/convexServer";
import { refreshOAuthIdentityTokens } from "../../../_lib/oauthProviders";
import { sealToken, unsealToken } from "../../../_lib/tokenVault";
import {
  createOAuthRefreshPostHandler,
  type OAuthRefreshDeps
} from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deps: OAuthRefreshDeps = {
  auth,
  getConvexServerClient,
  refreshOAuthIdentityTokens,
  sealToken,
  unsealToken
};

const handlePost = createOAuthRefreshPostHandler(deps);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  return handlePost(request, context);
}
