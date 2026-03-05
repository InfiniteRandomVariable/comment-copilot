import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { getConvexServerClient } from "../api/_lib/convexServer";
import { getOrchestrationRuntimeDetails } from "../api/_lib/orchestrationRuntime";
import {
  disconnectSocialAccessAction,
  refreshSocialTokenAction,
  updateAutopilotSettingsAction
} from "./actions";
import { RefreshTokenSubmit } from "../../components/refresh-token-submit";
import { DisconnectAccessSubmit } from "../../components/disconnect-access-submit";
import { SaveAutopilotSubmit } from "../../components/save-autopilot-submit";
import {
  BillingUsageSummary,
  healthColor,
  resolveConnectionHealth,
  resolveTokenHealth,
  resolveUsageHealth
} from "./health";

type Platform = "instagram" | "tiktok";

type OwnerAccount = {
  _id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  updatedAt: number;
};

type SocialCredential = {
  tokenExpiresAt?: number;
};

type AutopilotSettings = {
  enabled: boolean;
  maxRiskScore: number;
  minConfidenceScore: number;
  updatedAt: number;
};

async function getAppOrigin() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3100";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

function createStateToken(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function getOauthRedirectUri(platform: Platform, origin: string) {
  if (platform === "instagram") {
    return process.env.INSTAGRAM_REDIRECT_URI?.trim() || `${origin}/api/oauth/instagram/callback`;
  }

  return process.env.TIKTOK_REDIRECT_URI?.trim() || `${origin}/api/oauth/tiktok/callback`;
}

function buildOAuthConnectUrl(args: {
  platform: Platform;
  origin: string;
  state: string;
}) {
  if (args.platform === "instagram") {
    const clientId = process.env.INSTAGRAM_APP_ID?.trim();
    if (!clientId) return null;

    const scope =
      process.env.INSTAGRAM_OAUTH_SCOPES?.trim() || "user_profile,user_media";
    const url = new URL("https://api.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", getOauthRedirectUri("instagram", args.origin));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", args.state);
    return url.toString();
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  if (!clientKey) return null;

  const scope =
    process.env.TIKTOK_OAUTH_SCOPES?.trim() ||
    "user.info.basic,video.list";
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("redirect_uri", getOauthRedirectUri("tiktok", args.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", args.state);
  return url.toString();
}

function formatExpiry(ts?: number) {
  if (!ts) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(ts));
}

function formatThreshold(value: number) {
  return value.toFixed(2);
}

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{
    oauth?: string;
    oauth_error?: string;
    refresh?: string;
    refresh_error?: string;
    disconnect?: string;
    disconnect_error?: string;
    autopilot?: string;
    autopilot_error?: string;
    platform?: string;
    accountId?: string;
  }>;
}) {
  const params = await searchParams;
  const { userId } = await auth();
  const clerkUser = await currentUser();
  const origin = await getAppOrigin();
  const returnUrl = `${origin}/settings`;
  const orchestration = getOrchestrationRuntimeDetails();

  let ownerUserId: string | null = null;
  let ownerAccounts: OwnerAccount[] = [];
  let connectedData: Array<{
    account: OwnerAccount;
    credential: SocialCredential | null;
    autopilotSettings: AutopilotSettings;
    usageSummary: BillingUsageSummary | null;
  }> = [];

  if (userId) {
    const client = getConvexServerClient();
    const existingUser = (await client.query("users:getByClerkUserId" as never, {
      clerkUserId: userId
    } as never)) as { _id: string } | null;
    ownerUserId = existingUser?._id ?? null;

    if (ownerUserId) {
      ownerAccounts = (await client.query("accounts:listOwnerAccounts" as never, {
        ownerUserId
      } as never)) as OwnerAccount[];

      connectedData = await Promise.all(
        ownerAccounts.map(async (account) => {
          const [credential, autopilotSettings, usageSummary] = await Promise.all([
            client.query("socialAccounts:getByAccountId" as never, {
              accountId: account._id
            } as never) as Promise<SocialCredential | null>,
            client.query("autopilot:getAutopilotSettings" as never, {
              accountId: account._id
            } as never) as Promise<AutopilotSettings>,
            client.query("billing:getUsageSummary" as never, {
              accountId: account._id
            } as never) as Promise<BillingUsageSummary>
          ]);

          return { account, credential, autopilotSettings, usageSummary };
        })
      );
    }
  }

  const statePayload: Record<string, unknown> = {
    returnUrl
  };
  if (ownerUserId) {
    statePayload.ownerUserId = ownerUserId;
  }
  if (userId) {
    statePayload.clerkUserId = userId;
  }
  if (clerkUser?.primaryEmailAddress?.emailAddress) {
    statePayload.userEmail = clerkUser.primaryEmailAddress.emailAddress;
  }
  if (clerkUser?.fullName) {
    statePayload.userDisplayName = clerkUser.fullName;
  }
  const stateToken = createStateToken(statePayload);

  const instagramConnectUrl = buildOAuthConnectUrl({
    platform: "instagram",
    origin,
    state: stateToken
  });
  const tiktokConnectUrl = buildOAuthConnectUrl({
    platform: "tiktok",
    origin,
    state: stateToken
  });

  return (
    <div className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Autopilot Settings</h1>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Orchestration Runtime</h2>
        <p style={{ marginTop: 0 }}>
          Current mode:{" "}
          <code style={{ fontWeight: 700 }}>{orchestration.mode}</code>
          {orchestration.source === "default" ? " (default)" : ""}
        </p>
        <p style={{ margin: 0, color: "#59636e", fontSize: 13 }}>
          Env <code>COMMENT_ORCHESTRATION_MODE</code>: {" "}
          <code>{orchestration.rawMode ?? "(unset)"}</code>
        </p>
        <p style={{ marginBottom: 0, color: "#59636e", fontSize: 13 }}>
          {orchestration.mode === "inline"
            ? "Temporal worker is optional in this mode."
            : "Temporal worker must be running in this mode."}
        </p>
        {orchestration.isInvalidValue ? (
          <p style={{ marginBottom: 0, color: "#9f1239", fontSize: 13 }}>
            Unrecognized <code>COMMENT_ORCHESTRATION_MODE</code> value; falling back
            to <code>temporal</code>. Allowed values: <code>inline</code> or{" "}
            <code>temporal</code>.
          </p>
        ) : null}
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Social Account Connections</h2>
        {params.oauth === "connected" ? (
          <p style={{ color: "#0a7d40" }}>
            Connected <strong>{params.platform ?? "account"}</strong>
            {params.accountId ? ` (${params.accountId})` : ""}.
          </p>
        ) : null}
        {params.oauth === "error" ? (
          <p style={{ color: "#9f1239" }}>
            OAuth failed: {params.oauth_error ?? "Unknown OAuth error"}
          </p>
        ) : null}
        {params.refresh === "success" ? (
          <p style={{ color: "#0a7d40" }}>
            Token refreshed for <strong>{params.platform ?? "account"}</strong>
            {params.accountId ? ` (${params.accountId})` : ""}.
          </p>
        ) : null}
        {params.refresh === "error" ? (
          <p style={{ color: "#9f1239" }}>
            Token refresh failed: {params.refresh_error ?? "Unknown refresh error"}
          </p>
        ) : null}
        {params.disconnect === "success" ? (
          <p style={{ color: "#0a7d40" }}>
            Access disconnected for <strong>{params.platform ?? "account"}</strong>
            {params.accountId ? ` (${params.accountId})` : ""}.
          </p>
        ) : null}
        {params.disconnect === "error" ? (
          <p style={{ color: "#9f1239" }}>
            Disconnect failed: {params.disconnect_error ?? "Unknown disconnect error"}
          </p>
        ) : null}
        {params.autopilot === "updated" ? (
          <p style={{ color: "#0a7d40" }}>
            Autopilot settings saved for <strong>{params.accountId ?? "account"}</strong>.
          </p>
        ) : null}
        {params.autopilot === "error" ? (
          <p style={{ color: "#9f1239" }}>
            Autopilot settings update failed: {params.autopilot_error ?? "Unknown update error"}
          </p>
        ) : null}
        {ownerUserId ? (
          <p style={{ marginTop: 0, color: "#59636e" }}>
            Owner user ID resolved: <code>{ownerUserId}</code>
          </p>
        ) : (
          <p style={{ marginTop: 0, color: "#9f1239" }}>
            Owner user record not found yet. OAuth will still work with Clerk fallback.
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {instagramConnectUrl ? (
            <a className="btn" href={instagramConnectUrl}>
              Connect Instagram
            </a>
          ) : (
            <button className="btn" disabled>
              Connect Instagram (missing env)
            </button>
          )}
          {tiktokConnectUrl ? (
            <a className="btn" href={tiktokConnectUrl}>
              Connect TikTok
            </a>
          ) : (
            <button className="btn" disabled>
              Connect TikTok (missing env)
            </button>
          )}
        </div>
        <p style={{ marginBottom: 0, color: "#59636e", fontSize: 13 }}>
          Callback redirect target: <code>{returnUrl}</code>
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Connected Accounts</h2>
        {connectedData.length === 0 ? (
          <p style={{ margin: 0, color: "#59636e" }}>
            No linked social accounts found for this owner yet.
          </p>
        ) : (
          <div className="grid" style={{ gap: 10 }}>
            {connectedData.map(({ account, credential, autopilotSettings, usageSummary }) => {
              const connectionHealth = resolveConnectionHealth(Boolean(credential));
              const tokenHealth = resolveTokenHealth(credential?.tokenExpiresAt);
              const usageHealth = resolveUsageHealth(usageSummary);

              return (
              <article
                key={account._id}
                style={{
                  border: "1px solid #d8dedf",
                  borderRadius: 10,
                  padding: 10
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {account.displayName} (@{account.handle})
                </div>
                <div style={{ fontSize: 13, color: "#59636e", marginTop: 4 }}>
                  platform: {account.platform} | accountId: {account._id}
                </div>
                <div style={{ fontSize: 13, color: "#59636e", marginTop: 4 }}>
                  token expiry: {formatExpiry(credential?.tokenExpiresAt)}
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 13, color: healthColor(connectionHealth.level) }}>
                    Connection: <strong>{connectionHealth.label}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: healthColor(tokenHealth.level) }}>
                    Token health: <strong>{tokenHealth.label}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: healthColor(usageHealth.level) }}>
                    Usage health: <strong>{usageHealth.label}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "#59636e" }}>{usageHealth.detail}</div>
                </div>

                <form
                  action={updateAutopilotSettingsAction}
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #d8dedf",
                    background: "#f8fbfc"
                  }}
                >
                  <input type="hidden" name="accountId" value={account._id} />
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Autopilot controls</div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={autopilotSettings.enabled}
                    />
                    <span style={{ fontSize: 14 }}>
                      Enable autopilot auto-send for this account
                    </span>
                  </label>
                  <p style={{ marginTop: 6, marginBottom: 10, color: "#59636e", fontSize: 13 }}>
                    Turn this off to activate the kill switch and force all new drafts into
                    manual review.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                      gap: 8,
                      marginBottom: 10
                    }}
                  >
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "#59636e" }}>Max risk score (0-1)</span>
                      <input
                        type="number"
                        name="maxRiskScore"
                        min={0}
                        max={1}
                        step={0.01}
                        required
                        defaultValue={formatThreshold(autopilotSettings.maxRiskScore)}
                        style={{
                          border: "1px solid #c9d2d4",
                          borderRadius: 8,
                          padding: "8px 10px"
                        }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "#59636e" }}>
                        Min confidence score (0-1)
                      </span>
                      <input
                        type="number"
                        name="minConfidenceScore"
                        min={0}
                        max={1}
                        step={0.01}
                        required
                        defaultValue={formatThreshold(autopilotSettings.minConfidenceScore)}
                        style={{
                          border: "1px solid #c9d2d4",
                          borderRadius: 8,
                          padding: "8px 10px"
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <SaveAutopilotSubmit className="btn secondary" />
                    <span style={{ fontSize: 12, color: "#59636e" }}>
                      Last updated: {formatExpiry(autopilotSettings.updatedAt)}
                    </span>
                  </div>
                </form>

                {credential ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <form action={refreshSocialTokenAction} style={{ display: "inline-block" }}>
                      <input type="hidden" name="platform" value={account.platform} />
                      <input type="hidden" name="accountId" value={account._id} />
                      <RefreshTokenSubmit className="btn secondary" />
                    </form>
                    <form
                      action={disconnectSocialAccessAction}
                      style={{ display: "inline-block" }}
                    >
                      <input type="hidden" name="platform" value={account.platform} />
                      <input type="hidden" name="accountId" value={account._id} />
                      <DisconnectAccessSubmit className="btn secondary" />
                    </form>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, color: "#59636e", fontSize: 13 }}>
                    Access already disconnected.
                  </div>
                )}
              </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Autopilot defaults</h2>
        <ul>
          <li>maxRiskScore default: 0.25</li>
          <li>minConfidenceScore default: 0.80</li>
          <li>If no per-account settings exist, these defaults are used.</li>
        </ul>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Safeguards</h2>
        <ul>
          <li>Hard block for policy violations.</li>
          <li>Human approval for sensitive topics.</li>
          <li>Global kill switch for autopilot routing.</li>
        </ul>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Token Plan Defaults</h2>
        <ul>
          <li>Free monthly included tokens: 10,000</li>
          <li>Warning notification threshold: 8,000</li>
          <li>Free plan hard cap: 10,000 (AI generation pauses)</li>
          <li>Paid overage: $1.99 per additional 50,000 tokens</li>
        </ul>
      </section>
    </div>
  );
}
