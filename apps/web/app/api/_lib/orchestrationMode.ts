export type CommentOrchestrationMode = "temporal" | "inline";

function normalizeMode(rawMode: string | undefined) {
  return rawMode?.trim().toLowerCase();
}

export function getCommentOrchestrationMode(
  rawMode: string | undefined = process.env.COMMENT_ORCHESTRATION_MODE
): CommentOrchestrationMode {
  return normalizeMode(rawMode) === "inline" ? "inline" : "temporal";
}

export function isExplicitCommentOrchestrationMode(
  rawMode: string | undefined = process.env.COMMENT_ORCHESTRATION_MODE
) {
  const normalized = normalizeMode(rawMode);
  return normalized === "inline" || normalized === "temporal";
}
