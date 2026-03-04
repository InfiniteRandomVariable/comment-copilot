import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { GET as getOrchestrationHealth } from "../app/api/health/orchestration/route";

describe("GET /api/health/orchestration", () => {
  afterEach(() => {
    delete process.env.COMMENT_ORCHESTRATION_MODE;
    delete process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_NAMESPACE;
    delete process.env.TEMPORAL_TASK_QUEUE;
  });

  it("returns default temporal mode when env is unset", async () => {
    delete process.env.COMMENT_ORCHESTRATION_MODE;

    const response = await getOrchestrationHealth();
    assert.equal(response.status, 200);

    const json = (await response.json()) as {
      ok: boolean;
      orchestration: {
        mode: string;
        source: string;
        rawMode: string | null;
        isInvalidValue: boolean;
        fallbackMode: string | null;
        workerRequired: boolean;
        temporalConfig: {
          address: string;
          namespace: string;
          taskQueue: string;
          isDefaultAddress: boolean;
          isDefaultNamespace: boolean;
          isDefaultTaskQueue: boolean;
        };
        warnings: string[];
      };
    };

    assert.equal(json.ok, true);
    assert.deepEqual(json.orchestration, {
      mode: "temporal",
      source: "default",
      rawMode: null,
      isInvalidValue: false,
      fallbackMode: null,
      workerRequired: true,
      temporalConfig: {
        address: "localhost:7233",
        namespace: "default",
        taskQueue: "comment-copilot",
        isDefaultAddress: true,
        isDefaultNamespace: true,
        isDefaultTaskQueue: true
      },
      warnings: []
    });
  });

  it("returns inline mode when env is explicitly configured", async () => {
    process.env.COMMENT_ORCHESTRATION_MODE = " INLINE ";
    process.env.TEMPORAL_ADDRESS = "temporal.prod:7233";
    process.env.TEMPORAL_NAMESPACE = "prod";
    process.env.TEMPORAL_TASK_QUEUE = "comment-copilot-prod";

    const response = await getOrchestrationHealth();
    assert.equal(response.status, 200);

    const json = (await response.json()) as {
      orchestration: {
        mode: string;
        source: string;
        rawMode: string | null;
        isInvalidValue: boolean;
        fallbackMode: string | null;
        workerRequired: boolean;
        temporalConfig: {
          address: string;
          namespace: string;
          taskQueue: string;
          isDefaultAddress: boolean;
          isDefaultNamespace: boolean;
          isDefaultTaskQueue: boolean;
        };
        warnings: string[];
      };
    };

    assert.equal(json.orchestration.mode, "inline");
    assert.equal(json.orchestration.source, "env");
    assert.equal(json.orchestration.rawMode, "INLINE");
    assert.equal(json.orchestration.isInvalidValue, false);
    assert.equal(json.orchestration.fallbackMode, null);
    assert.equal(json.orchestration.workerRequired, false);
    assert.deepEqual(json.orchestration.temporalConfig, {
      address: "temporal.prod:7233",
      namespace: "prod",
      taskQueue: "comment-copilot-prod",
      isDefaultAddress: false,
      isDefaultNamespace: false,
      isDefaultTaskQueue: false
    });
    assert.deepEqual(json.orchestration.warnings, []);
  });

  it("marks invalid env value and reports temporal fallback", async () => {
    process.env.COMMENT_ORCHESTRATION_MODE = "unknown-mode";

    const response = await getOrchestrationHealth();
    assert.equal(response.status, 200);

    const json = (await response.json()) as {
      orchestration: {
        mode: string;
        source: string;
        rawMode: string | null;
        isInvalidValue: boolean;
        fallbackMode: string | null;
        workerRequired: boolean;
        temporalConfig: {
          address: string;
          namespace: string;
          taskQueue: string;
          isDefaultAddress: boolean;
          isDefaultNamespace: boolean;
          isDefaultTaskQueue: boolean;
        };
        warnings: string[];
      };
    };

    assert.equal(json.orchestration.mode, "temporal");
    assert.equal(json.orchestration.source, "default");
    assert.equal(json.orchestration.rawMode, "unknown-mode");
    assert.equal(json.orchestration.isInvalidValue, true);
    assert.equal(json.orchestration.fallbackMode, "temporal");
    assert.equal(json.orchestration.workerRequired, true);
    assert.equal(json.orchestration.warnings.length, 1);
    assert.match(
      json.orchestration.warnings[0] ?? "",
      /Unrecognized COMMENT_ORCHESTRATION_MODE=unknown-mode/
    );
  });
});
