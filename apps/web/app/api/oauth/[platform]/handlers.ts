type SupportedPlatform = "instagram" | "tiktok";

type ConvexLikeClient = {
  query: (...args: any[]) => Promise<unknown>;
  mutation: (...args: any[]) => Promise<unknown>;
};

type OAuthIdentityAndTokens = {
  platform: SupportedPlatform;
  platformAccountId: string;
  handle: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes: string[];
};

type RouteContext = { params: Promise<{ platform: string }> };

export const INSTAGRAM_REVOCATION_LIMITATION =
  "Meta Instagram Basic Display API does not provide a token revocation endpoint. " +
  "Disconnect removes local credentials only; users must revoke app access manually in Instagram/Meta app settings.";

function asSupportedPlatform(platform: string): SupportedPlatform | null {
  if (platform === "instagram" || platform === "tiktok") {
    return platform;
  }
  return null;
}

function decodeStatePayload(rawState: string | null) {
  if (!rawState) return null;

  const candidates = [rawState];
  try {
    const base64Decoded = Buffer.from(rawState, "base64url").toString("utf8");
    candidates.push(base64Decoded);
  } catch {
    // Ignore invalid base64url payloads.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        ownerUserId?: string;
        clerkUserId?: string;
        userEmail?: string;
        userDisplayName?: string;
        returnUrl?: string;
      };
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Ignore invalid JSON candidates.
    }
  }

  return null;
}

function buildErrorRedirectUrl(baseUrl: string, error: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("oauth", "error");
  url.searchParams.set("oauth_error", error);
  return url;
}

function redirectTo(url: URL) {
  return Response.redirect(url, 307);
}

export type OAuthCallbackDeps = {
  getConvexServerClient: () => ConvexLikeClient;
  exchangeOAuthCodeForIdentity: (args: {
    platform: SupportedPlatform;
    code: string;
    redirectUri: string;
  }) => Promise<OAuthIdentityAndTokens>;
  resolveOAuthRedirectUri: (platform: SupportedPlatform, requestUrl: string) => string;
  sealToken: (token: string) => string;
};

export function createOAuthCallbackGetHandler(deps: OAuthCallbackDeps) {
  return async function GET(request: Request, context: RouteContext) {
    const { platform } = await context.params;
    const supportedPlatform = asSupportedPlatform(platform);
    if (!supportedPlatform) {
      return Response.json({ error: "Unsupported OAuth platform" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const providerError = searchParams.get("error");
    const providerErrorDescription = searchParams.get("error_description");
    const state = decodeStatePayload(searchParams.get("state"));
    let ownerUserId = state?.ownerUserId ?? searchParams.get("ownerUserId");
    const clerkUserId = state?.clerkUserId ?? searchParams.get("clerkUserId");
    const userEmail = state?.userEmail ?? searchParams.get("userEmail") ?? undefined;
    const userDisplayName =
      state?.userDisplayName ?? searchParams.get("userDisplayName") ?? undefined;
    const returnUrl = state?.returnUrl ?? `${new URL(request.url).origin}/settings`;

    if (providerError) {
      return redirectTo(
        buildErrorRedirectUrl(returnUrl, providerErrorDescription ?? providerError)
      );
    }

    const code = searchParams.get("code");
    if (!code) {
      return redirectTo(buildErrorRedirectUrl(returnUrl, "Missing OAuth code"));
    }

    if (!ownerUserId && clerkUserId) {
      const client = deps.getConvexServerClient();
      const user = (await client.query("users:getByClerkUserId", {
        clerkUserId
      })) as { _id: string } | null;
      if (user?._id) {
        ownerUserId = user._id;
      } else {
        ownerUserId = (await client.mutation("users:upsertFromClerkIdentity", {
          clerkUserId,
          email: userEmail,
          displayName: userDisplayName
        })) as string;
      }
    }

    if (!ownerUserId) {
      return redirectTo(
        buildErrorRedirectUrl(
          returnUrl,
          "Missing ownerUserId (or resolvable clerkUserId) in OAuth state"
        )
      );
    }

    try {
      const redirectUri = deps.resolveOAuthRedirectUri(supportedPlatform, request.url);
      const identity = await deps.exchangeOAuthCodeForIdentity({
        platform: supportedPlatform,
        code,
        redirectUri
      });

      const client = deps.getConvexServerClient();
      const accountId = (await client.mutation("accounts:upsertAccountFromOAuth", {
        ownerUserId,
        platform: supportedPlatform,
        platformAccountId: identity.platformAccountId,
        handle: identity.handle,
        displayName: identity.displayName
      })) as string;

      await client.mutation("socialAccounts:upsertCredentials", {
        accountId,
        accessTokenRef: deps.sealToken(identity.accessToken),
        refreshTokenRef: identity.refreshToken
          ? deps.sealToken(identity.refreshToken)
          : undefined,
        tokenExpiresAt: identity.expiresAt,
        scopes: identity.scopes
      });

      const successUrl = new URL(returnUrl);
      successUrl.searchParams.set("oauth", "connected");
      successUrl.searchParams.set("platform", supportedPlatform);
      successUrl.searchParams.set("accountId", accountId);
      return redirectTo(successUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OAuth callback processing failed";
      return redirectTo(buildErrorRedirectUrl(returnUrl, message));
    }
  };
}

export type OAuthRefreshDeps = {
  auth: () => Promise<{ userId: string | null }>;
  getConvexServerClient: () => ConvexLikeClient;
  refreshOAuthIdentityTokens: (args: {
    platform: SupportedPlatform;
    accessToken: string;
    refreshToken?: string;
  }) => Promise<OAuthIdentityAndTokens>;
  sealToken: (token: string) => string;
  unsealToken: (tokenRef: string) => string;
};

export function createOAuthRefreshPostHandler(deps: OAuthRefreshDeps) {
  return async function POST(request: Request, context: RouteContext) {
    try {
      const { userId: clerkUserId } = await deps.auth();
      if (!clerkUserId) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      const { platform } = await context.params;
      const supportedPlatform = asSupportedPlatform(platform);
      if (!supportedPlatform) {
        return Response.json({ ok: false, error: "Unsupported OAuth platform" }, { status: 400 });
      }

      const body = (await request.json()) as { accountId?: string };
      if (!body.accountId) {
        return Response.json({ ok: false, error: "Missing accountId" }, { status: 400 });
      }

      const client = deps.getConvexServerClient();
      const ownerUser = (await client.query("users:getByClerkUserId", {
        clerkUserId
      })) as { _id: string } | null;
      if (!ownerUser) {
        return Response.json({ ok: false, error: "Owner user not found" }, { status: 404 });
      }

      const account = (await client.query("accounts:getAccountById", {
        accountId: body.accountId
      })) as {
        _id: string;
        platform: SupportedPlatform;
        ownerUserId: string;
      } | null;
      if (!account) {
        return Response.json({ ok: false, error: "Account not found" }, { status: 404 });
      }

      if (account.ownerUserId !== ownerUser._id) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }

      if (account.platform !== supportedPlatform) {
        return Response.json({ ok: false, error: "Platform/account mismatch" }, { status: 400 });
      }

      const socialAccount = (await client.query("socialAccounts:getByAccountId", {
        accountId: account._id
      })) as {
        accessTokenRef: string;
        refreshTokenRef?: string;
        scopes: string[];
      } | null;
      if (!socialAccount) {
        return Response.json(
          { ok: false, error: "Social account credentials not found" },
          { status: 404 }
        );
      }

      const refreshed = await deps.refreshOAuthIdentityTokens({
        platform: supportedPlatform,
        accessToken: deps.unsealToken(socialAccount.accessTokenRef),
        refreshToken: socialAccount.refreshTokenRef
          ? deps.unsealToken(socialAccount.refreshTokenRef)
          : undefined
      });

      await client.mutation("socialAccounts:upsertCredentials", {
        accountId: account._id,
        accessTokenRef: deps.sealToken(refreshed.accessToken),
        refreshTokenRef: refreshed.refreshToken
          ? deps.sealToken(refreshed.refreshToken)
          : socialAccount.refreshTokenRef,
        tokenExpiresAt: refreshed.expiresAt,
        scopes: refreshed.scopes.length > 0 ? refreshed.scopes : socialAccount.scopes
      });

      return Response.json({
        ok: true,
        platform: supportedPlatform,
        accountId: account._id,
        tokenExpiresAt: refreshed.expiresAt ?? null
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OAuth token refresh failed";
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  };
}

export type OAuthDisconnectDeps = {
  auth: () => Promise<{ userId: string | null }>;
  getConvexServerClient: () => ConvexLikeClient;
  unsealToken: (tokenRef: string) => string;
  revokeTiktokAccessToken: (accessToken: string) => Promise<void>;
};

export function createOAuthDisconnectPostHandler(deps: OAuthDisconnectDeps) {
  return async function POST(request: Request, context: RouteContext) {
    try {
      const { userId: clerkUserId } = await deps.auth();
      if (!clerkUserId) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      const { platform } = await context.params;
      const supportedPlatform = asSupportedPlatform(platform);
      if (!supportedPlatform) {
        return Response.json({ ok: false, error: "Unsupported OAuth platform" }, { status: 400 });
      }

      const body = (await request.json()) as { accountId?: string };
      if (!body.accountId) {
        return Response.json({ ok: false, error: "Missing accountId" }, { status: 400 });
      }

      const client = deps.getConvexServerClient();
      const ownerUser = (await client.query("users:getByClerkUserId", {
        clerkUserId
      })) as { _id: string } | null;
      if (!ownerUser) {
        return Response.json({ ok: false, error: "Owner user not found" }, { status: 404 });
      }

      const account = (await client.query("accounts:getAccountById", {
        accountId: body.accountId
      })) as {
        _id: string;
        platform: SupportedPlatform;
        ownerUserId: string;
      } | null;
      if (!account) {
        return Response.json({ ok: false, error: "Account not found" }, { status: 404 });
      }

      if (account.ownerUserId !== ownerUser._id) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }

      if (account.platform !== supportedPlatform) {
        return Response.json({ ok: false, error: "Platform/account mismatch" }, { status: 400 });
      }

      const socialAccount = (await client.query("socialAccounts:getByAccountId", {
        accountId: account._id
      })) as { accessTokenRef: string } | null;

      let providerRevocation: {
        attempted: boolean;
        status: "revoked" | "skipped" | "failed";
        detail?: string;
      } = {
        attempted: false,
        status: "skipped",
        detail: "No stored social credentials"
      };

      if (socialAccount?.accessTokenRef) {
        if (supportedPlatform === "tiktok") {
          try {
            await deps.revokeTiktokAccessToken(
              deps.unsealToken(socialAccount.accessTokenRef)
            );
            providerRevocation = {
              attempted: true,
              status: "revoked"
            };
          } catch (error) {
            providerRevocation = {
              attempted: true,
              status: "failed",
              detail:
                error instanceof Error
                  ? error.message
                  : "Unknown TikTok revoke failure"
            };
          }
        } else {
          providerRevocation = {
            attempted: false,
            status: "skipped",
            detail: INSTAGRAM_REVOCATION_LIMITATION
          };
        }
      }

      const result = await client.mutation("socialAccounts:disconnectByAccountId", {
        accountId: account._id
      });

      return Response.json({
        ok: true,
        platform: supportedPlatform,
        accountId: account._id,
        providerRevocation,
        result
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OAuth disconnect failed";
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  };
}
