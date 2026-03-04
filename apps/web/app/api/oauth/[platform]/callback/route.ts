import { NextRequest } from "next/server";
import { getConvexServerClient } from "../../../_lib/convexServer";
import {
  exchangeOAuthCodeForIdentity,
  resolveOAuthRedirectUri
} from "../../../_lib/oauthProviders";
import { sealToken } from "../../../_lib/tokenVault";
import {
  createOAuthCallbackGetHandler,
  type OAuthCallbackDeps
} from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deps: OAuthCallbackDeps = {
  getConvexServerClient,
  exchangeOAuthCodeForIdentity,
  resolveOAuthRedirectUri,
  sealToken
};

const handleGet = createOAuthCallbackGetHandler(deps);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  return handleGet(request, context);
}
