import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

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

function createAutopilotForm(overrides?: Record<string, string>) {
  const form = new FormData();
  const values: Record<string, string> = {
    accountId: "acc_1",
    enabled: "on",
    maxRiskScore: "0.35",
    minConfidenceScore: "0.85",
    ...(overrides ?? {})
  };
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

function parseRedirectUrl(pathWithQuery: string) {
  return new URL(pathWithQuery, "https://app.local");
}

const hoisted = vi.hoisted(() => ({
  client: null as unknown as {
    query: (fn: string, payload: unknown) => Promise<unknown>;
    mutation: (fn: string, payload: unknown) => Promise<unknown>;
  },
  userId: "clerk_user_1" as string | null,
  lastRedirectUrl: ""
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: hoisted.userId })
}));

vi.mock("../app/api/_lib/convexServer", () => ({
  getConvexServerClient: () => hoisted.client
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    hoisted.lastRedirectUrl = url;
    throw new Error("__REDIRECT__");
  }
}));

import { updateAutopilotSettingsAction } from "../app/settings/actions";

describe("Settings autopilot action", () => {
  beforeEach(() => {
    hoisted.lastRedirectUrl = "";
    hoisted.userId = "clerk_user_1";
  });

  it("updates autopilot settings for an owned account", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:listOwnerAccounts") return [{ _id: "acc_1" }];
        return null;
      },
      mutation: async () => "autopilot_settings_1"
    });
    hoisted.client = client as never;

    await assert.rejects(updateAutopilotSettingsAction(createAutopilotForm()), /__REDIRECT__/);

    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0]?.fn, "autopilot:upsertAutopilotSettings");
    assert.deepEqual(mutationCalls[0]?.args, {
      accountId: "acc_1",
      enabled: true,
      maxRiskScore: 0.35,
      minConfidenceScore: 0.85
    });

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("autopilot"), "updated");
    assert.equal(redirectUrl.searchParams.get("accountId"), "acc_1");
    assert.equal(redirectUrl.searchParams.get("autopilot_error"), null);
  });

  it("allows disabling autopilot as an explicit kill switch", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async (fn) => {
        if (fn === "users:getByClerkUserId") return { _id: "owner_1" };
        if (fn === "accounts:listOwnerAccounts") return [{ _id: "acc_1" }];
        return null;
      },
      mutation: async () => "autopilot_settings_1"
    });
    hoisted.client = client as never;

    const form = createAutopilotForm();
    form.delete("enabled");

    await assert.rejects(updateAutopilotSettingsAction(form), /__REDIRECT__/);

    assert.equal(mutationCalls.length, 1);
    assert.equal((mutationCalls[0]?.args as { enabled: boolean }).enabled, false);

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("autopilot"), "updated");
  });

  it("returns a validation error for thresholds outside 0..1", async () => {
    const { client, mutationCalls } = createMockClient({
      query: async () => {
        throw new Error("Should not query ownership on invalid threshold input");
      }
    });
    hoisted.client = client as never;

    await assert.rejects(
      updateAutopilotSettingsAction(createAutopilotForm({ maxRiskScore: "1.25" })),
      /__REDIRECT__/
    );

    assert.equal(mutationCalls.length, 0);

    const redirectUrl = parseRedirectUrl(hoisted.lastRedirectUrl);
    assert.equal(redirectUrl.searchParams.get("autopilot"), "error");
    assert.match(
      redirectUrl.searchParams.get("autopilot_error") ?? "",
      /must be between 0 and 1/
    );
  });
});
