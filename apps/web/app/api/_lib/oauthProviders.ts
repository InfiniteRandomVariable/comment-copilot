type OAuthPlatform = "instagram" | "tiktok";

export type OAuthIdentityAndTokens = {
  platform: OAuthPlatform;
  platformAccountId: string;
  handle: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes: string[];
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function toExpiresAtFromNow(expiresInSeconds?: number) {
  if (!expiresInSeconds || Number.isNaN(expiresInSeconds)) {
    return undefined;
  }
  return Date.now() + expiresInSeconds * 1000;
}

function splitScopes(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function fallbackHandle(platform: OAuthPlatform, platformAccountId: string) {
  return `${platform}_${platformAccountId.slice(0, 12)}`;
}

export function resolveOAuthRedirectUri(platform: OAuthPlatform, requestUrl: string) {
  const perPlatformEnv =
    platform === "instagram"
      ? process.env.INSTAGRAM_REDIRECT_URI
      : process.env.TIKTOK_REDIRECT_URI;

  if (perPlatformEnv?.trim()) {
    return perPlatformEnv.trim();
  }

  const url = new URL(requestUrl);
  return `${url.origin}/api/oauth/${platform}/callback`;
}

export async function exchangeOAuthCodeForIdentity(args: {
  platform: OAuthPlatform;
  code: string;
  redirectUri: string;
}): Promise<OAuthIdentityAndTokens> {
  if (args.platform === "tiktok") {
    return exchangeTiktokCode(args.code, args.redirectUri);
  }
  return exchangeInstagramCode(args.code, args.redirectUri);
}

export async function refreshOAuthIdentityTokens(args: {
  platform: OAuthPlatform;
  accessToken: string;
  refreshToken?: string;
}) {
  if (args.platform === "tiktok") {
    return refreshTiktokToken(args.refreshToken);
  }
  return refreshInstagramToken(args.accessToken);
}

async function exchangeTiktokCode(code: string, redirectUri: string) {
  const clientKey = getRequiredEnv("TIKTOK_CLIENT_KEY");
  const clientSecret = getRequiredEnv("TIKTOK_CLIENT_SECRET");

  const tokenBody = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenBody.toString(),
    cache: "no-store"
  });

  if (!tokenResponse.ok) {
    const bodyText = await tokenResponse.text();
    throw new Error(`TikTok token exchange failed (${tokenResponse.status}): ${bodyText}`);
  }

  const tokenJson = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    scope?: string;
  };

  if (!tokenJson.access_token || !tokenJson.open_id) {
    throw new Error("TikTok token response missing access_token or open_id");
  }

  const userInfoResponse = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`
      },
      cache: "no-store"
    }
  );

  if (!userInfoResponse.ok) {
    const bodyText = await userInfoResponse.text();
    throw new Error(`TikTok user info request failed (${userInfoResponse.status}): ${bodyText}`);
  }

  const userInfoJson = (await userInfoResponse.json()) as {
    data?: {
      user?: {
        open_id?: string;
        username?: string;
        display_name?: string;
      };
    };
  };
  const user = userInfoJson.data?.user;
  const platformAccountId = user?.open_id ?? tokenJson.open_id;
  const handle = user?.username ?? fallbackHandle("tiktok", platformAccountId);
  const displayName = user?.display_name ?? handle;

  return {
    platform: "tiktok" as const,
    platformAccountId,
    handle,
    displayName,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt: toExpiresAtFromNow(tokenJson.expires_in),
    scopes: splitScopes(tokenJson.scope)
  };
}

async function refreshTiktokToken(refreshToken?: string) {
  if (!refreshToken) {
    throw new Error("TikTok refresh token is missing");
  }

  const clientKey = getRequiredEnv("TIKTOK_CLIENT_KEY");
  const clientSecret = getRequiredEnv("TIKTOK_CLIENT_SECRET");
  const tokenBody = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenBody.toString(),
    cache: "no-store"
  });

  if (!tokenResponse.ok) {
    const bodyText = await tokenResponse.text();
    throw new Error(`TikTok token refresh failed (${tokenResponse.status}): ${bodyText}`);
  }

  const tokenJson = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    scope?: string;
  };

  if (!tokenJson.access_token || !tokenJson.open_id) {
    throw new Error("TikTok refresh response missing access_token or open_id");
  }

  return {
    platform: "tiktok" as const,
    platformAccountId: tokenJson.open_id,
    handle: fallbackHandle("tiktok", tokenJson.open_id),
    displayName: fallbackHandle("tiktok", tokenJson.open_id),
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token ?? refreshToken,
    expiresAt: toExpiresAtFromNow(tokenJson.expires_in),
    scopes: splitScopes(tokenJson.scope)
  };
}

async function exchangeInstagramCode(code: string, redirectUri: string) {
  const clientId = getRequiredEnv("INSTAGRAM_APP_ID");
  const clientSecret = getRequiredEnv("INSTAGRAM_APP_SECRET");

  const shortLivedBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code
  });

  const shortLivedTokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: shortLivedBody.toString(),
    cache: "no-store"
  });

  if (!shortLivedTokenResponse.ok) {
    const bodyText = await shortLivedTokenResponse.text();
    throw new Error(
      `Instagram short-lived token exchange failed (${shortLivedTokenResponse.status}): ${bodyText}`
    );
  }

  const shortLivedTokenJson = (await shortLivedTokenResponse.json()) as {
    access_token?: string;
    user_id?: number | string;
  };
  if (!shortLivedTokenJson.access_token) {
    throw new Error("Instagram token response missing access_token");
  }

  const exchangeUrl = new URL("https://graph.instagram.com/access_token");
  exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
  exchangeUrl.searchParams.set("client_secret", clientSecret);
  exchangeUrl.searchParams.set("access_token", shortLivedTokenJson.access_token);

  const longLivedTokenResponse = await fetch(exchangeUrl.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!longLivedTokenResponse.ok) {
    const bodyText = await longLivedTokenResponse.text();
    throw new Error(
      `Instagram long-lived token exchange failed (${longLivedTokenResponse.status}): ${bodyText}`
    );
  }

  const longLivedTokenJson = (await longLivedTokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!longLivedTokenJson.access_token) {
    throw new Error("Instagram long-lived exchange response missing access_token");
  }

  const profileUrl = new URL("https://graph.instagram.com/me");
  profileUrl.searchParams.set("fields", "id,username");
  profileUrl.searchParams.set("access_token", longLivedTokenJson.access_token);

  const profileResponse = await fetch(profileUrl.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!profileResponse.ok) {
    const bodyText = await profileResponse.text();
    throw new Error(`Instagram profile request failed (${profileResponse.status}): ${bodyText}`);
  }

  const profileJson = (await profileResponse.json()) as {
    id?: string;
    username?: string;
  };
  if (!profileJson.id) {
    throw new Error("Instagram profile response missing id");
  }

  const handle = profileJson.username ?? fallbackHandle("instagram", profileJson.id);
  return {
    platform: "instagram" as const,
    platformAccountId: profileJson.id,
    handle,
    displayName: handle,
    accessToken: longLivedTokenJson.access_token,
    refreshToken: undefined,
    expiresAt: toExpiresAtFromNow(longLivedTokenJson.expires_in),
    scopes: []
  };
}

async function refreshInstagramToken(accessToken: string) {
  if (!accessToken) {
    throw new Error("Instagram access token is missing");
  }

  const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
  refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
  refreshUrl.searchParams.set("access_token", accessToken);

  const refreshResponse = await fetch(refreshUrl.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!refreshResponse.ok) {
    const bodyText = await refreshResponse.text();
    throw new Error(`Instagram token refresh failed (${refreshResponse.status}): ${bodyText}`);
  }

  const refreshJson = (await refreshResponse.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  const nextAccessToken = refreshJson.access_token ?? accessToken;

  const profileUrl = new URL("https://graph.instagram.com/me");
  profileUrl.searchParams.set("fields", "id,username");
  profileUrl.searchParams.set("access_token", nextAccessToken);
  const profileResponse = await fetch(profileUrl.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!profileResponse.ok) {
    const bodyText = await profileResponse.text();
    throw new Error(`Instagram profile request failed (${profileResponse.status}): ${bodyText}`);
  }

  const profileJson = (await profileResponse.json()) as {
    id?: string;
    username?: string;
  };
  if (!profileJson.id) {
    throw new Error("Instagram profile response missing id");
  }

  const handle = profileJson.username ?? fallbackHandle("instagram", profileJson.id);
  return {
    platform: "instagram" as const,
    platformAccountId: profileJson.id,
    handle,
    displayName: handle,
    accessToken: nextAccessToken,
    refreshToken: undefined,
    expiresAt: toExpiresAtFromNow(refreshJson.expires_in),
    scopes: []
  };
}
