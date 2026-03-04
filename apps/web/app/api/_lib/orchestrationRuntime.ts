import {
  getCommentOrchestrationMode,
  isExplicitCommentOrchestrationMode,
  type CommentOrchestrationMode
} from "./orchestrationMode";

export interface OrchestrationRuntimeDetails {
  mode: CommentOrchestrationMode;
  source: "env" | "default";
  rawMode: string | null;
  isInvalidValue: boolean;
  fallbackMode: "temporal" | null;
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
}

export function getOrchestrationRuntimeDetails(): OrchestrationRuntimeDetails {
  const rawMode = process.env.COMMENT_ORCHESTRATION_MODE?.trim();
  const mode = getCommentOrchestrationMode(rawMode);
  const source = isExplicitCommentOrchestrationMode(rawMode) ? "env" : "default";
  const isInvalidValue = Boolean(rawMode) && source === "default";
  const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const temporalNamespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const temporalTaskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "comment-copilot";
  const warnings = isInvalidValue
    ? [
        `Unrecognized COMMENT_ORCHESTRATION_MODE=${rawMode}; falling back to temporal. ` +
          "Allowed values: inline|temporal."
      ]
    : [];

  return {
    mode,
    source,
    rawMode: rawMode ?? null,
    isInvalidValue,
    fallbackMode: isInvalidValue ? "temporal" : null,
    workerRequired: mode === "temporal",
    temporalConfig: {
      address: temporalAddress,
      namespace: temporalNamespace,
      taskQueue: temporalTaskQueue,
      isDefaultAddress: temporalAddress === "localhost:7233",
      isDefaultNamespace: temporalNamespace === "default",
      isDefaultTaskQueue: temporalTaskQueue === "comment-copilot"
    },
    warnings
  };
}
