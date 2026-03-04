import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { getOrchestrationRuntimeDetails } from "../app/api/_lib/orchestrationRuntime";

describe("getOrchestrationRuntimeDetails", () => {
  afterEach(() => {
    delete process.env.COMMENT_ORCHESTRATION_MODE;
    delete process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_NAMESPACE;
    delete process.env.TEMPORAL_TASK_QUEUE;
  });

  it("returns defaults when env values are absent", () => {
    const details = getOrchestrationRuntimeDetails();

    assert.deepEqual(details, {
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

  it("returns inline env mode and custom temporal settings", () => {
    process.env.COMMENT_ORCHESTRATION_MODE = " inline ";
    process.env.TEMPORAL_ADDRESS = "host:7233";
    process.env.TEMPORAL_NAMESPACE = "prod";
    process.env.TEMPORAL_TASK_QUEUE = "queue_prod";

    const details = getOrchestrationRuntimeDetails();

    assert.equal(details.mode, "inline");
    assert.equal(details.source, "env");
    assert.equal(details.rawMode, "inline");
    assert.equal(details.workerRequired, false);
    assert.deepEqual(details.temporalConfig, {
      address: "host:7233",
      namespace: "prod",
      taskQueue: "queue_prod",
      isDefaultAddress: false,
      isDefaultNamespace: false,
      isDefaultTaskQueue: false
    });
    assert.deepEqual(details.warnings, []);
  });

  it("flags invalid mode values with fallback warning", () => {
    process.env.COMMENT_ORCHESTRATION_MODE = "bad-mode";

    const details = getOrchestrationRuntimeDetails();

    assert.equal(details.mode, "temporal");
    assert.equal(details.source, "default");
    assert.equal(details.rawMode, "bad-mode");
    assert.equal(details.isInvalidValue, true);
    assert.equal(details.fallbackMode, "temporal");
    assert.equal(details.warnings.length, 1);
    assert.match(details.warnings[0] ?? "", /Allowed values: inline\|temporal\./);
  });
});
