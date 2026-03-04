import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  createOAuthCallbackGetHandler,
  createOAuthRefreshPostHandler,
  createOAuthDisconnectPostHandler,
  INSTAGRAM_REVOCATION_LIMITATION
} from "../app/api/oauth/[platform]/handlers";

type QueryCall = { fn: string; args: unknown };
type MutationCall = { fn: string; args: unknown };

function createMockClient(args: {
  query?: (fn: string, payload: unknown) => Promise<unknown>;
  mutation?: (fn: string, payload: unknown) => Promise<unknown>;
}) {
  const queryCalls: QueryCall[] = [];
  const mutationCalls: MutationCall[] = [];

  return {
    queryCalls,
    mutationCalls,
    client: {
      query: async (fn: string, payload: unknown) => {
        queryCalls.push({ fn, args: payload });
        return args.query ? args.query(fn, payload) : null;
      },
      mutation: async (fn: string, payload: unknown) => {
        mutationCalls.push({ fn, args: payload });
        return args.mutation ? args.mutation(fn, payload) : null;
      }
    }
  };
}

function createPostRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function getRedirectUrl(response: Response) {
  const location = response.headers.get("location");
  assert.ok(location, "Expected redirect location header");
  return new URL(location);
}

describe("OAuth callback state handling", () => {
  it("returns 400 for unsupported platform", async () => {
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      exchangeOAuthCodeForIdentity: async () => {
        throw new Error("Should not reach provider exchange");
      },
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/unsupported/callback",
      sealToken: (token: string) => token
    });

    const response = await handler(
      new Request("https://app.local/api/oauth/unsupported/callback?code=abc"),
      {
        params: Promise.resolve({ platform: "unsupported" })
      }
    );

    assert.equal(response.status, 400);
    const json = (await response.json()) as { error: string };
    assert.equal(json.error, "Unsupported OAuth platform");
  });

  it("redirects with provider error and description from callback query", async () => {
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      exchangeOAuthCodeForIdentity: async () => {
        throw new Error("Should not reach provider exchange");
      },
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => token
    });

    const state = Buffer.from(
      JSON.stringify({
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const request = new Request(
      `https://app.local/api/oauth/instagram/callback?error=access_denied&error_description=DeniedByUser&state=${state}`
    );

    const response = await handler(request, {
      params: Promise.resolve({ platform: "instagram" })
    });

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "error");
    assert.equal(redirectUrl.searchParams.get("oauth_error"), "DeniedByUser");
  });

  it("redirects with provider error fallback when error_description is missing", async () => {
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      exchangeOAuthCodeForIdentity: async () => {
        throw new Error("Should not reach provider exchange");
      },
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => token
    });

    const state = Buffer.from(
      JSON.stringify({
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const request = new Request(
      `https://app.local/api/oauth/instagram/callback?error=access_denied&state=${state}`
    );

    const response = await handler(request, {
      params: Promise.resolve({ platform: "instagram" })
    });

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "error");
    assert.equal(redirectUrl.searchParams.get("oauth_error"), "access_denied");
  });

  it("accepts raw JSON state (non-base64) and uses ownerUserId from it", async () => {
    const { client, mutationCalls } = createMockClient({
      mutation: async (fn) => {
        if (fn === "accounts:upsertAccountFromOAuth") return "acc_raw_state";
        return null;
      }
    });
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () => client as never,
      exchangeOAuthCodeForIdentity: async () => ({
        platform: "instagram",
        platformAccountId: "ig_raw",
        handle: "creator_raw",
        displayName: "Creator Raw",
        accessToken: "access_raw",
        refreshToken: undefined,
        expiresAt: undefined,
        scopes: []
      }),
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => `sealed:${token}`
    });

    const rawState = encodeURIComponent(
      JSON.stringify({
        ownerUserId: "owner_from_raw_json",
        returnUrl: "https://app.local/settings"
      })
    );

    const response = await handler(
      new Request(
        `https://app.local/api/oauth/instagram/callback?code=code_raw_state&state=${rawState}`
      ),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "connected");
    assert.equal(redirectUrl.searchParams.get("accountId"), "acc_raw_state");

    const upsertAccountCall = mutationCalls.find(
      (call) => call.fn === "accounts:upsertAccountFromOAuth"
    );
    assert.ok(upsertAccountCall);
    assert.equal(
      (upsertAccountCall.args as { ownerUserId: string }).ownerUserId,
      "owner_from_raw_json"
    );
  });

  it("uses ownerUserId query param when state is absent", async () => {
    const { client, mutationCalls } = createMockClient({
      mutation: async (fn) => {
        if (fn === "accounts:upsertAccountFromOAuth") return "acc_query_owner";
        return null;
      }
    });
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () => client as never,
      exchangeOAuthCodeForIdentity: async () => ({
        platform: "instagram",
        platformAccountId: "ig_query",
        handle: "creator_query",
        displayName: "Creator Query",
        accessToken: "access_query",
        refreshToken: undefined,
        expiresAt: undefined,
        scopes: []
      }),
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => `sealed:${token}`
    });

    const response = await handler(
      new Request(
        "https://app.local/api/oauth/instagram/callback?code=code_query_owner&ownerUserId=owner_from_query"
      ),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "connected");
    assert.equal(redirectUrl.searchParams.get("accountId"), "acc_query_owner");

    const upsertAccountCall = mutationCalls.find(
      (call) => call.fn === "accounts:upsertAccountFromOAuth"
    );
    assert.ok(upsertAccountCall);
    assert.equal(
      (upsertAccountCall.args as { ownerUserId: string }).ownerUserId,
      "owner_from_query"
    );
  });

  it("redirects with error when callback code is missing", async () => {
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      exchangeOAuthCodeForIdentity: async () => {
        throw new Error("Should not reach provider exchange");
      },
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => token
    });

    const state = Buffer.from(
      JSON.stringify({
        ownerUserId: "owner_abc",
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const response = await handler(
      new Request(
        `https://app.local/api/oauth/instagram/callback?state=${state}`
      ),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "error");
    assert.equal(redirectUrl.searchParams.get("oauth_error"), "Missing OAuth code");
  });

  it("uses base64url state ownerUserId and returnUrl for successful callback", async () => {
    const { client, mutationCalls } = createMockClient({
      mutation: async (fn) => {
        if (fn === "accounts:upsertAccountFromOAuth") return "acc_123";
        return null;
      }
    });
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () => client as never,
      exchangeOAuthCodeForIdentity: async () => ({
        platform: "instagram",
        platformAccountId: "ig_1",
        handle: "creator",
        displayName: "Creator",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        expiresAt: 1234567890,
        scopes: ["user_profile", "user_media"]
      }),
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => `sealed:${token}`
    });

    const state = Buffer.from(
      JSON.stringify({
        ownerUserId: "owner_abc",
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const request = new Request(
      `https://app.local/api/oauth/instagram/callback?code=code_123&state=${state}`
    );

    const response = await handler(request, {
      params: Promise.resolve({ platform: "instagram" })
    });

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "connected");
    assert.equal(redirectUrl.searchParams.get("platform"), "instagram");
    assert.equal(redirectUrl.searchParams.get("accountId"), "acc_123");

    const upsertAccountCall = mutationCalls.find(
      (call) => call.fn === "accounts:upsertAccountFromOAuth"
    );
    assert.ok(upsertAccountCall);
    assert.equal(
      (upsertAccountCall.args as { ownerUserId: string }).ownerUserId,
      "owner_abc"
    );
  });

  it("resolves owner via clerkUserId from state when ownerUserId is absent", async () => {
    const { client, queryCalls, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_from_clerk" };
        return null;
      },
      mutation: async (fn) => {
        if (fn === "accounts:upsertAccountFromOAuth") return "acc_from_clerk";
        return null;
      }
    });

    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () => client as never,
      exchangeOAuthCodeForIdentity: async () => ({
        platform: "instagram",
        platformAccountId: "ig_2",
        handle: "creator2",
        displayName: "Creator 2",
        accessToken: "access_token_2",
        refreshToken: undefined,
        expiresAt: undefined,
        scopes: []
      }),
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => `sealed:${token}`
    });

    const state = Buffer.from(
      JSON.stringify({
        clerkUserId: "clerk_123",
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const request = new Request(
      `https://app.local/api/oauth/instagram/callback?code=code_456&state=${state}`
    );
    const response = await handler(request, {
      params: Promise.resolve({ platform: "instagram" })
    });

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "connected");
    assert.equal(redirectUrl.searchParams.get("accountId"), "acc_from_clerk");
    assert.equal(queryCalls[0]?.fn, "users:getByClerkUserId");

    const upsertAccountCall = mutationCalls.find(
      (call) => call.fn === "accounts:upsertAccountFromOAuth"
    );
    assert.ok(upsertAccountCall);
    assert.equal(
      (upsertAccountCall.args as { ownerUserId: string }).ownerUserId,
      "owner_from_clerk"
    );
  });

  it("creates owner from clerk identity when clerk user does not exist", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return null;
        return null;
      },
      mutation: async (fn) => {
        if (fn === "users:upsertFromClerkIdentity") return "owner_created";
        if (fn === "accounts:upsertAccountFromOAuth") return "acc_created";
        return null;
      }
    });

    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () => client as never,
      exchangeOAuthCodeForIdentity: async () => ({
        platform: "instagram",
        platformAccountId: "ig_3",
        handle: "creator3",
        displayName: "Creator 3",
        accessToken: "token3",
        refreshToken: undefined,
        expiresAt: undefined,
        scopes: []
      }),
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => `sealed:${token}`
    });

    const state = Buffer.from(
      JSON.stringify({
        clerkUserId: "clerk_new",
        userEmail: "owner@example.com",
        userDisplayName: "Owner Name",
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const response = await handler(
      new Request(
        `https://app.local/api/oauth/instagram/callback?code=code_create_owner&state=${state}`
      ),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "connected");
    assert.equal(redirectUrl.searchParams.get("accountId"), "acc_created");

    const upsertOwnerCall = mutationCalls.find(
      (call) => call.fn === "users:upsertFromClerkIdentity"
    );
    assert.ok(upsertOwnerCall);
    assert.equal(
      (upsertOwnerCall.args as { clerkUserId: string }).clerkUserId,
      "clerk_new"
    );
  });

  it("redirects with exchange error when provider token exchange fails", async () => {
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      exchangeOAuthCodeForIdentity: async () => {
        throw new Error("Instagram token exchange failed");
      },
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => token
    });

    const state = Buffer.from(
      JSON.stringify({
        ownerUserId: "owner_abc",
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const response = await handler(
      new Request(
        `https://app.local/api/oauth/instagram/callback?code=code_fail&state=${state}`
      ),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "error");
    assert.equal(
      redirectUrl.searchParams.get("oauth_error"),
      "Instagram token exchange failed"
    );
  });

  it("redirects with error when state lacks ownerUserId and clerkUserId", async () => {
    const handler = createOAuthCallbackGetHandler({
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      exchangeOAuthCodeForIdentity: async () => {
        throw new Error("Should not reach provider exchange");
      },
      resolveOAuthRedirectUri: () => "https://app.local/api/oauth/instagram/callback",
      sealToken: (token: string) => token
    });

    const state = Buffer.from(
      JSON.stringify({
        returnUrl: "https://app.local/settings"
      })
    ).toString("base64url");

    const request = new Request(
      `https://app.local/api/oauth/instagram/callback?code=code_missing_owner&state=${state}`
    );
    const response = await handler(request, {
      params: Promise.resolve({ platform: "instagram" })
    });

    assert.equal(response.status, 307);
    const redirectUrl = getRedirectUrl(response);
    assert.equal(redirectUrl.searchParams.get("oauth"), "error");
    assert.equal(
      redirectUrl.searchParams.get("oauth_error"),
      "Missing ownerUserId (or resolvable clerkUserId) in OAuth state"
    );
  });
});

describe("OAuth refresh ownership enforcement", () => {
  it("returns 400 for unsupported platform", async () => {
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      refreshOAuthIdentityTokens: async () => {
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/unknown/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "unknown" })
      }
    );

    assert.equal(response.status, 400);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Unsupported OAuth platform");
  });

  it("refreshes credentials successfully", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "instagram", ownerUserId: "owner_1" };
        }
        if (fn === "socialAccounts:getByAccountId") {
          return {
            accessTokenRef: "sealed_access",
            refreshTokenRef: "sealed_refresh",
            scopes: ["user_profile"]
          };
        }
        return null;
      },
      mutation: async () => ({})
    });
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      refreshOAuthIdentityTokens: async () => ({
        platform: "instagram",
        platformAccountId: "ig_1",
        handle: "creator",
        displayName: "Creator",
        accessToken: "fresh_access",
        refreshToken: "fresh_refresh",
        expiresAt: 999999999,
        scopes: ["user_profile", "user_media"]
      }),
      sealToken: (token: string) => `sealed:${token}`,
      unsealToken: (tokenRef: string) => `raw:${tokenRef}`
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      ok: boolean;
      platform: string;
      accountId: string;
      tokenExpiresAt: number | null;
    };
    assert.equal(json.ok, true);
    assert.equal(json.platform, "instagram");
    assert.equal(json.accountId, "acc_1");
    assert.equal(json.tokenExpiresAt, 999999999);

    const upsertCredsCall = mutationCalls.find(
      (call) => call.fn === "socialAccounts:upsertCredentials"
    );
    assert.ok(upsertCredsCall);
    const args = upsertCredsCall.args as {
      accessTokenRef: string;
      refreshTokenRef?: string;
      scopes: string[];
    };
    assert.equal(args.accessTokenRef, "sealed:fresh_access");
    assert.equal(args.refreshTokenRef, "sealed:fresh_refresh");
    assert.deepEqual(args.scopes, ["user_profile", "user_media"]);
  });

  it("returns 500 when refresh provider call throws", async () => {
    const { client } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "instagram", ownerUserId: "owner_1" };
        }
        if (fn === "socialAccounts:getByAccountId") {
          return {
            accessTokenRef: "sealed_access",
            refreshTokenRef: "sealed_refresh",
            scopes: ["user_profile"]
          };
        }
        return null;
      }
    });
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      refreshOAuthIdentityTokens: async () => {
        throw new Error("Refresh upstream failed");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 500);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Refresh upstream failed");
  });

  it("returns 400 when accountId is missing", async () => {
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      refreshOAuthIdentityTokens: async () => {
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {}),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 400);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Missing accountId");
  });

  it("returns 400 when account platform does not match route platform", async () => {
    let refreshCalled = false;
    const { client } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "tiktok", ownerUserId: "owner_1" };
        }
        return null;
      }
    });
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      refreshOAuthIdentityTokens: async () => {
        refreshCalled = true;
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 400);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Platform/account mismatch");
    assert.equal(refreshCalled, false);
  });

  it("returns 404 when owner user is not found", async () => {
    let refreshCalled = false;
    const { client } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return null;
        return null;
      }
    });
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      refreshOAuthIdentityTokens: async () => {
        refreshCalled = true;
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 404);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Owner user not found");
    assert.equal(refreshCalled, false);
  });

  it("returns 404 when account is not found", async () => {
    let refreshCalled = false;
    const { client } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") return null;
        return null;
      }
    });
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      refreshOAuthIdentityTokens: async () => {
        refreshCalled = true;
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 404);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Account not found");
    assert.equal(refreshCalled, false);
  });

  it("returns 404 when social credentials are not found", async () => {
    let refreshCalled = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "instagram", ownerUserId: "owner_1" };
        }
        if (fn === "socialAccounts:getByAccountId") return null;
        return null;
      },
      mutation: async () => ({})
    });
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      refreshOAuthIdentityTokens: async () => {
        refreshCalled = true;
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 404);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Social account credentials not found");
    assert.equal(refreshCalled, false);
    assert.equal(mutationCalls.length, 0);
  });

  it("returns 401 when unauthenticated", async () => {
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: null }),
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      refreshOAuthIdentityTokens: async () => {
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 401);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Unauthorized");
  });

  it("returns 403 when account owner does not match authenticated owner", async () => {
    let refreshCalled = false;
    const { client } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "instagram", ownerUserId: "owner_2" };
        }
        return null;
      }
    });
    const handler = createOAuthRefreshPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      refreshOAuthIdentityTokens: async () => {
        refreshCalled = true;
        throw new Error("Should not refresh");
      },
      sealToken: (token: string) => token,
      unsealToken: (tokenRef: string) => tokenRef
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/refresh", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 403);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Forbidden");
    assert.equal(refreshCalled, false);
  });
});

describe("OAuth disconnect ownership enforcement", () => {
  it("returns 400 for unsupported platform", async () => {
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => undefined
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/unknown/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "unknown" })
      }
    );

    assert.equal(response.status, 400);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Unsupported OAuth platform");
  });

  it("disconnects with no social credentials and skips provider revoke", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "instagram", ownerUserId: "owner_1" };
        }
        if (fn === "socialAccounts:getByAccountId") return null;
        return null;
      },
      mutation: async (fn) => {
        if (fn === "socialAccounts:disconnectByAccountId") {
          return { accountId: "acc_1", credentialsRemoved: false, accountDeactivated: true };
        }
        return {};
      }
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => undefined
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      ok: boolean;
      providerRevocation: { attempted: boolean; status: string; detail?: string };
    };
    assert.equal(json.ok, true);
    assert.equal(json.providerRevocation.attempted, false);
    assert.equal(json.providerRevocation.status, "skipped");
    assert.equal(json.providerRevocation.detail, "No stored social credentials");
    assert.equal(
      mutationCalls.filter((call) => call.fn === "socialAccounts:disconnectByAccountId").length,
      1
    );
  });

  it("instagram disconnect with credentials skips provider revoke with documented limitation", async () => {
    const { client } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "instagram", ownerUserId: "owner_1" };
        }
        if (fn === "socialAccounts:getByAccountId") return { accessTokenRef: "token_ref" };
        return null;
      },
      mutation: async () => ({ accountId: "acc_1" })
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => undefined
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      providerRevocation: { attempted: boolean; status: string; detail?: string };
    };
    assert.equal(json.providerRevocation.attempted, false);
    assert.equal(json.providerRevocation.status, "skipped");
    assert.equal(json.providerRevocation.detail, INSTAGRAM_REVOCATION_LIMITATION);
  });

  it("tiktok disconnect marks provider revoke as revoked on success", async () => {
    let revokeCalled = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_tk", platform: "tiktok", ownerUserId: "owner_1" };
        }
        if (fn === "socialAccounts:getByAccountId") return { accessTokenRef: "sealed_tiktok" };
        return null;
      },
      mutation: async () => ({ accountId: "acc_tk", accountDeactivated: true })
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: () => "raw_tiktok_token",
      revokeTiktokAccessToken: async () => {
        revokeCalled = true;
      }
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/tiktok/disconnect", {
        accountId: "acc_tk"
      }),
      {
        params: Promise.resolve({ platform: "tiktok" })
      }
    );

    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      providerRevocation: { attempted: boolean; status: string; detail?: string };
    };
    assert.equal(revokeCalled, true);
    assert.equal(json.providerRevocation.attempted, true);
    assert.equal(json.providerRevocation.status, "revoked");
    assert.equal(
      mutationCalls.filter((call) => call.fn === "socialAccounts:disconnectByAccountId").length,
      1
    );
  });

  it("tiktok disconnect marks provider revoke as failed but still disconnects locally", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_tk", platform: "tiktok", ownerUserId: "owner_1" };
        }
        if (fn === "socialAccounts:getByAccountId") return { accessTokenRef: "sealed_tiktok" };
        return null;
      },
      mutation: async () => ({ accountId: "acc_tk", accountDeactivated: true })
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: () => "raw_tiktok_token",
      revokeTiktokAccessToken: async () => {
        throw new Error("TikTok revoke failed hard");
      }
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/tiktok/disconnect", {
        accountId: "acc_tk"
      }),
      {
        params: Promise.resolve({ platform: "tiktok" })
      }
    );

    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      providerRevocation: { attempted: boolean; status: string; detail?: string };
    };
    assert.equal(json.providerRevocation.attempted, true);
    assert.equal(json.providerRevocation.status, "failed");
    assert.equal(json.providerRevocation.detail, "TikTok revoke failed hard");
    assert.equal(
      mutationCalls.filter((call) => call.fn === "socialAccounts:disconnectByAccountId").length,
      1
    );
  });

  it("returns 400 when accountId is missing", async () => {
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => undefined
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {}),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 400);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Missing accountId");
  });

  it("returns 400 when account platform does not match route platform", async () => {
    let revokeCalled = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "tiktok", ownerUserId: "owner_1" };
        }
        return null;
      },
      mutation: async () => ({})
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => {
        revokeCalled = true;
      }
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 400);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Platform/account mismatch");
    assert.equal(revokeCalled, false);
    assert.equal(mutationCalls.length, 0);
  });

  it("returns 404 when owner user is not found", async () => {
    let revokeCalled = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return null;
        return null;
      },
      mutation: async () => ({})
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => {
        revokeCalled = true;
      }
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 404);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Owner user not found");
    assert.equal(revokeCalled, false);
    assert.equal(mutationCalls.length, 0);
  });

  it("returns 404 when account is not found", async () => {
    let revokeCalled = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") return null;
        return null;
      },
      mutation: async () => ({})
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => {
        revokeCalled = true;
      }
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 404);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Account not found");
    assert.equal(revokeCalled, false);
    assert.equal(mutationCalls.length, 0);
  });

  it("returns 401 when unauthenticated", async () => {
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: null }),
      getConvexServerClient: () =>
        ({
          query: async () => null,
          mutation: async () => null
        }) as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => undefined
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 401);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Unauthorized");
  });

  it("returns 403 when account owner does not match authenticated owner", async () => {
    let revokeCalled = false;
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:getAccountById") {
          return { _id: "acc_1", platform: "instagram", ownerUserId: "owner_2" };
        }
        return null;
      },
      mutation: async () => ({})
    });
    const handler = createOAuthDisconnectPostHandler({
      auth: async () => ({ userId: "clerk_1" }),
      getConvexServerClient: () => client as never,
      unsealToken: (tokenRef: string) => tokenRef,
      revokeTiktokAccessToken: async () => {
        revokeCalled = true;
      }
    });

    const response = await handler(
      createPostRequest("https://app.local/api/oauth/instagram/disconnect", {
        accountId: "acc_1"
      }),
      {
        params: Promise.resolve({ platform: "instagram" })
      }
    );

    assert.equal(response.status, 403);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.equal(json.error, "Forbidden");
    assert.equal(revokeCalled, false);
    assert.equal(mutationCalls.length, 0);
  });
});
