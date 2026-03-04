import { ConvexHttpClient } from "convex/browser";
import { getConvexUrlOrThrow } from "../env";

function getClient() {
  return new ConvexHttpClient(getConvexUrlOrThrow("worker activities"));
}

type IntentLabel =
  | "question"
  | "praise"
  | "objection"
  | "troll"
  | "purchase_intent"
  | "support_request"
  | "unknown";

interface GenerateDraftInput {
  accountId: string;
  commentId: string;
  commentText: string;
  sourceVideoTitle: string;
  creatorThemeSummary: string;
  intentLabel: IntentLabel;
  intentConfidence: number;
  engagementGoal: string;
  responseStyleMarkdown: string;
  customStyleMarkdown: string;
  contextCompleteness: "complete" | "partial";
}

interface GenerationTelemetry {
  providerAttempts: number;
  providerRetries: number;
  providerStatusCode: number | null;
  providerUsedRetryAfter: boolean;
  model: string;
}

interface SafetyGateInput {
  accountId: string;
  commentId: string;
  commentText: string;
  draftText: string;
  intentLabel: IntentLabel;
  intentConfidence: number;
  safetyFlags: string[];
}

interface SafetyTelemetry {
  providerAttempts: number;
  providerRetries: number;
  providerStatusCode: number | null;
  providerUsedRetryAfter: boolean;
  model: string;
}

interface SafetyGateResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  safetyFlags: string[];
  rationale: string;
  moderationTelemetry: SafetyTelemetry;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parsePositiveIntOrDefault(rawValue: string | undefined, fallback: number) {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function parseRetryAfterMs(retryAfterHeader: string | null) {
  if (!retryAfterHeader) return undefined;

  const asSeconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds * 1000;
  }

  const asDateMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(asDateMs)) return undefined;

  const deltaMs = asDateMs - Date.now();
  return deltaMs > 0 ? deltaMs : undefined;
}

function computeRetryDelayMs(
  attemptIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
  retryAfterMs?: number
) {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(maxDelayMs, retryAfterMs);
  }

  const exponentialMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attemptIndex);
  const jitterRangeMs = Math.max(1, Math.floor(baseDelayMs * 0.5));
  const jitterMs = Math.floor(Math.random() * jitterRangeMs);
  return Math.min(maxDelayMs, exponentialMs + jitterMs);
}

function extractProviderErrorMessage(rawResponseBody: string) {
  const parsed = extractJsonObject(rawResponseBody);
  if (
    typeof parsed?.error === "object" &&
    parsed.error !== null &&
    typeof (parsed.error as { message?: unknown }).message === "string"
  ) {
    return (parsed.error as { message: string }).message;
  }
  return rawResponseBody.slice(0, 300);
}

async function callProviderWithRetry(args: {
  url: string;
  apiKey: string;
  requestBody: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  retryMaxMs: number;
  errorContext: string;
}) {
  let response: Response | undefined;
  let responseBody = "";
  let attempts = 0;
  let retries = 0;
  let statusCode: number | null = null;
  let usedRetryAfter = false;

  for (let attempt = 0; attempt <= args.maxRetries; attempt += 1) {
    attempts = attempt + 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

    try {
      response = await fetch(args.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json"
        },
        body: args.requestBody,
        signal: controller.signal
      });
    } catch (error) {
      const isAbortError =
        error instanceof DOMException && error.name === "AbortError";
      const isNetworkError = error instanceof TypeError;
      const shouldRetry = (isAbortError || isNetworkError) && attempt < args.maxRetries;
      if (!shouldRetry) {
        throw error;
      }

      retries += 1;
      const delayMs = computeRetryDelayMs(
        attempt,
        args.retryBaseMs,
        args.retryMaxMs
      );
      await sleep(delayMs);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    responseBody = await response.text();
    statusCode = response.status;
    if (response.ok) {
      return {
        responseBody,
        attempts,
        retries,
        statusCode,
        usedRetryAfter
      };
    }

    const shouldRetry = isRetryableStatus(response.status) && attempt < args.maxRetries;
    if (shouldRetry) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      if (retryAfterMs && retryAfterMs > 0) {
        usedRetryAfter = true;
      }
      retries += 1;
      const delayMs = computeRetryDelayMs(
        attempt,
        args.retryBaseMs,
        args.retryMaxMs,
        retryAfterMs
      );
      await sleep(delayMs);
      continue;
    }

    const errorMessage = extractProviderErrorMessage(responseBody);
    throw new Error(`${args.errorContext} (${response.status}): ${errorMessage}`);
  }

  throw new Error(`${args.errorContext} failed after retries`);
}

function stripMarkdownCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function toSafeSignal(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripMarkdownCodeFence(raw);
  const parseAttempts = [cleaned];

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    parseAttempts.push(cleaned.slice(start, end + 1));
  }

  for (const candidate of parseAttempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function extractAssistantText(responsePayload: unknown) {
  if (!responsePayload || typeof responsePayload !== "object") return "";

  const choices = (responsePayload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";

  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts = content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";

      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean);

  return parts.join(" ").trim();
}

function extractUsageTokens(responsePayload: unknown) {
  if (!responsePayload || typeof responsePayload !== "object") {
    return {
      promptTokens: undefined as number | undefined,
      completionTokens: undefined as number | undefined
    };
  }

  const usage = (responsePayload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return {
      promptTokens: undefined as number | undefined,
      completionTokens: undefined as number | undefined
    };
  }

  const promptTokens = (usage as { prompt_tokens?: unknown }).prompt_tokens;
  const completionTokens = (usage as { completion_tokens?: unknown }).completion_tokens;

  return {
    promptTokens: typeof promptTokens === "number" ? promptTokens : undefined,
    completionTokens: typeof completionTokens === "number" ? completionTokens : undefined
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function toRiskLevel(score: number): "low" | "medium" | "high" {
  if (score <= 0.25) return "low";
  if (score <= 0.6) return "medium";
  return "high";
}

function extractModerationSignals(responsePayload: unknown) {
  const empty = {
    flagged: false,
    categories: [] as string[],
    maxCategoryScore: 0
  };

  if (!responsePayload || typeof responsePayload !== "object") {
    return empty;
  }

  const results = (responsePayload as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) {
    return empty;
  }

  const first = results[0];
  if (!first || typeof first !== "object") {
    return empty;
  }

  const flagged =
    typeof (first as { flagged?: unknown }).flagged === "boolean"
      ? ((first as { flagged: boolean }).flagged)
      : false;

  const categoriesObj = (first as { categories?: unknown }).categories;
  const categoryScoresObj = (first as { category_scores?: unknown }).category_scores;

  const categories: string[] = [];
  if (categoriesObj && typeof categoriesObj === "object") {
    for (const [key, value] of Object.entries(categoriesObj)) {
      if (value === true) {
        categories.push(toSafeSignal(key));
      }
    }
  }

  let maxCategoryScore = 0;
  if (categoryScoresObj && typeof categoryScoresObj === "object") {
    for (const value of Object.values(categoryScoresObj)) {
      if (typeof value === "number" && value > maxCategoryScore) {
        maxCategoryScore = value;
      }
    }
  }

  return {
    flagged,
    categories,
    maxCategoryScore: clamp01(maxCategoryScore)
  };
}

function buildFallbackDraftText(input: GenerateDraftInput) {
  const clippedComment = input.commentText.trim().slice(0, 220);
  const sourceRef = input.sourceVideoTitle
    ? `on "${input.sourceVideoTitle.trim().slice(0, 80)}"`
    : "on your recent post";

  const engagementPrompt =
    input.intentLabel === "question"
      ? "Want me to share a quick tip here too?"
      : input.intentLabel === "purchase_intent"
        ? "If you want, I can share the best next option for you."
        : input.intentLabel === "praise"
          ? "Appreciate you being here."
          : "Thanks for being part of the conversation.";

  const stylePrefix = input.customStyleMarkdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("-"))
    ?.replace(/^-\s*/, "")
    ?.slice(0, 80);

  const personalizedStarter = stylePrefix
    ? `${stylePrefix} `
    : "Thanks for your comment. ";

  return normalizeWhitespace(
    `${personalizedStarter}${clippedComment} ${sourceRef}. ${engagementPrompt}`
  );
}

function parseProviderDraft(rawAssistantText: string) {
  const parsed = extractJsonObject(rawAssistantText);
  if (!parsed) {
    return {
      draftText: "",
      rationale: "",
      personalizationSignals: [] as string[]
    };
  }

  const draftText = typeof parsed.draftText === "string" ? parsed.draftText : "";
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale : "";
  const personalizationSignals = Array.isArray(parsed.personalizationSignals)
    ? parsed.personalizationSignals.filter(
        (value): value is string => typeof value === "string"
      )
    : [];

  return { draftText, rationale, personalizationSignals };
}

function buildBaseSignals(input: GenerateDraftInput) {
  return [
    `intent:${input.intentLabel}`,
    input.sourceVideoTitle ? "source_video_title" : "source_video_missing",
    input.creatorThemeSummary ? "creator_theme" : "creator_theme_missing"
  ];
}

export async function logStage(args: {
  accountId: string;
  commentId: string;
  stage:
    | "context"
    | "intent"
    | "generation"
    | "safety"
    | "routing"
    | "review"
    | "engagement";
  runStatus: "started" | "completed" | "failed";
  metadata: Record<string, unknown>;
}) {
  const client = getClient();
  await client.mutation(
    "agentRuns:logAgentRunStage" as never,
    {
      accountId: args.accountId,
      commentId: args.commentId,
      workflowId: process.env.TEMPORAL_TASK_QUEUE ?? "comment-copilot",
      runStatus: args.runStatus,
      stage: args.stage,
      metadataJson: JSON.stringify(args.metadata)
    } as never
  );
}

export async function buildContext(input: { accountId: string; commentId: string }) {
  const client = getClient();
  return client.mutation("context:buildCommentContext" as never, {
    accountId: input.accountId,
    commentId: input.commentId
  } as never) as Promise<{
    accountId: string;
    commentId: string;
    messageId: string;
    commentText: string;
    sourceVideoTitle: string;
    creatorThemeSummary: string;
    commenterProfileSummary: unknown;
    commenterLatestVideoSummary: unknown;
    responseStyleSkillVersionId: string | null;
    customResponseStyleSkillVersionId: string | null;
    responseStyleMarkdown: string;
    customStyleMarkdown: string;
    contextCompleteness: "complete" | "partial";
    missingContextFields: string[];
    contextSnapshotJson: string;
  }>;
}

export async function interpretIntent(input: {
  accountId: string;
  commentId: string;
  commentText: string;
}) {
  const client = getClient();
  return client.mutation("intent:interpretCommentIntent" as never, {
    accountId: input.accountId,
    commentId: input.commentId,
    commentText: input.commentText
  } as never) as Promise<{
    intentLabel: IntentLabel;
    intentConfidence: number;
    engagementGoal: string;
    safetyFlags: string[];
  }>;
}

export async function generateDraft(input: GenerateDraftInput) {
  const client = getClient();
  const model = process.env.AI_MODEL;
  const completionsUrl = process.env.AI_CHAT_COMPLETIONS_URL;
  const providerTimeoutMs = parsePositiveIntOrDefault(
    process.env.AI_PROVIDER_TIMEOUT_MS,
    20_000
  );
  const providerMaxRetries = parsePositiveIntOrDefault(
    process.env.AI_PROVIDER_MAX_RETRIES,
    2
  );
  const providerRetryBaseMs = parsePositiveIntOrDefault(
    process.env.AI_PROVIDER_RETRY_BASE_MS,
    500
  );
  const providerRetryMaxMs = parsePositiveIntOrDefault(
    process.env.AI_PROVIDER_RETRY_MAX_MS,
    5_000
  );

  if (!model) {
    throw new Error("AI_MODEL is not set for worker generation");
  }
  if (!completionsUrl) {
    throw new Error("AI_CHAT_COMPLETIONS_URL is not set for worker generation");
  }

  const estimatedTokens = Math.max(
    260,
    Math.ceil(
      (input.commentText.length + input.creatorThemeSummary.length + input.responseStyleMarkdown.length) *
        0.45
    )
  );

  const reservation = (await client.mutation(
    "billing:reserveTokensForGeneration" as never,
      {
        accountId: input.accountId,
        commentId: input.commentId,
        estimatedTokens,
        model,
        workflowId: process.env.TEMPORAL_TASK_QUEUE ?? "comment-copilot"
      } as never
  )) as { reservationId: string };

  const fallbackDraftText = buildFallbackDraftText(input);
  const fallbackPromptTokens = Math.max(
    130,
    Math.ceil((input.commentText.length + input.creatorThemeSummary.length) * 0.7)
  );

  let promptTokens = 0;
  let completionTokens = 0;
  let draft:
    | {
        draftText: string;
        confidenceScore: number;
        rationale: string;
        personalizationSignals: string[];
        generationTelemetry: GenerationTelemetry;
      }
    | undefined;
  let generationError: unknown;
  let finalizationError: unknown;

  try {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error("AI_API_KEY is not set for worker generation");
    }

    const systemPrompt = [
      "You draft social-media comment replies for a creator account.",
      "Follow brand style and keep replies concise, natural, and safe.",
      "Never include policy explanations, only the reply content.",
      "Return strict JSON with keys: draftText, rationale, personalizationSignals.",
      "draftText must be 1-2 sentences and under 280 characters."
    ].join("\n");

    const userPayload = {
      commentText: input.commentText,
      sourceVideoTitle: input.sourceVideoTitle,
      creatorThemeSummary: input.creatorThemeSummary,
      intentLabel: input.intentLabel,
      intentConfidence: input.intentConfidence,
      engagementGoal: input.engagementGoal,
      contextCompleteness: input.contextCompleteness,
      responseStyleMarkdown: input.responseStyleMarkdown,
      customStyleMarkdown: input.customStyleMarkdown
    };

    const requestBody = JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) }
      ]
    });

    const providerCall = await callProviderWithRetry({
      url: completionsUrl,
      apiKey,
      requestBody,
      timeoutMs: providerTimeoutMs,
      maxRetries: providerMaxRetries,
      retryBaseMs: providerRetryBaseMs,
      retryMaxMs: providerRetryMaxMs,
      errorContext: "Draft generation provider request failed"
    });
    const providerBodyText = providerCall.responseBody;

    let providerPayload: unknown;
    try {
      providerPayload = JSON.parse(providerBodyText);
    } catch {
      throw new Error("Draft generation provider returned invalid JSON payload");
    }

    const assistantText = extractAssistantText(providerPayload);
    if (!assistantText) {
      throw new Error("Draft generation provider returned empty completion");
    }

    const parsedDraft = parseProviderDraft(assistantText);
    const draftText = normalizeWhitespace(
      (parsedDraft.draftText || stripMarkdownCodeFence(assistantText) || fallbackDraftText).slice(
        0,
        280
      )
    );
    if (!draftText) {
      throw new Error("Draft generation provider did not produce a usable draft");
    }

    const baseSignals = buildBaseSignals(input);
    const modelSignals = parsedDraft.personalizationSignals
      .map(toSafeSignal)
      .filter(Boolean);
    const personalizationSignals = Array.from(
      new Set([...baseSignals, ...modelSignals])
    ).slice(0, 8);

    const rationale = normalizeWhitespace(
      parsedDraft.rationale ||
        "Generated with provider completion using interpreted intent and active style context."
    ).slice(0, 260);

    const usage = extractUsageTokens(providerPayload);
    promptTokens =
      usage.promptTokens && usage.promptTokens > 0
        ? usage.promptTokens
        : fallbackPromptTokens;
    completionTokens =
      usage.completionTokens && usage.completionTokens > 0
        ? usage.completionTokens
        : Math.max(50, Math.ceil(draftText.length * 0.5));

    draft = {
      draftText,
      confidenceScore: Number(
        Math.max(
          0.68,
          Math.min(
            0.94,
            input.intentConfidence +
              (input.contextCompleteness === "complete" ? 0.04 : -0.02)
          )
        ).toFixed(2)
      ),
      rationale,
      personalizationSignals,
      generationTelemetry: {
        providerAttempts: providerCall.attempts,
        providerRetries: providerCall.retries,
        providerStatusCode: providerCall.statusCode,
        providerUsedRetryAfter: providerCall.usedRetryAfter,
        model
      }
    };
  } catch (error) {
    generationError = error;
  } finally {
    try {
      await client.mutation(
        "billing:finalizeTokenReservation" as never,
        {
          reservationId: reservation.reservationId,
          promptTokens,
          completionTokens,
          model
        } as never
      );
    } catch (error) {
      finalizationError = error;
    }
  }

  if (generationError) {
    throw generationError;
  }
  if (finalizationError) {
    throw finalizationError;
  }
  if (!draft) {
    throw new Error("Draft generation unexpectedly completed without a result");
  }

  return draft;
}

export async function runSafetyGate(input: SafetyGateInput): Promise<SafetyGateResult> {
  const moderationUrl = process.env.AI_MODERATION_URL;
  const moderationModel = process.env.AI_MODERATION_MODEL;
  const apiKey = process.env.AI_MODERATION_API_KEY ?? process.env.AI_API_KEY;

  if (!moderationUrl) {
    throw new Error("AI_MODERATION_URL is not set for worker safety gate");
  }
  if (!moderationModel) {
    throw new Error("AI_MODERATION_MODEL is not set for worker safety gate");
  }
  if (!apiKey) {
    throw new Error("AI_MODERATION_API_KEY (or AI_API_KEY) is not set for worker safety gate");
  }

  const timeoutMs = parsePositiveIntOrDefault(
    process.env.AI_MODERATION_TIMEOUT_MS ?? process.env.AI_PROVIDER_TIMEOUT_MS,
    20_000
  );
  const maxRetries = parsePositiveIntOrDefault(
    process.env.AI_MODERATION_MAX_RETRIES ?? process.env.AI_PROVIDER_MAX_RETRIES,
    2
  );
  const retryBaseMs = parsePositiveIntOrDefault(
    process.env.AI_MODERATION_RETRY_BASE_MS ?? process.env.AI_PROVIDER_RETRY_BASE_MS,
    500
  );
  const retryMaxMs = parsePositiveIntOrDefault(
    process.env.AI_MODERATION_RETRY_MAX_MS ?? process.env.AI_PROVIDER_RETRY_MAX_MS,
    5_000
  );

  const moderationInput = normalizeWhitespace(
    `comment: ${input.commentText}\ndraft: ${input.draftText}\nintent: ${input.intentLabel}`
  );
  const requestBody = JSON.stringify({
    model: moderationModel,
    input: moderationInput
  });

  const providerCall = await callProviderWithRetry({
    url: moderationUrl,
    apiKey,
    requestBody,
    timeoutMs,
    maxRetries,
    retryBaseMs,
    retryMaxMs,
    errorContext: "Safety moderation provider request failed"
  });

  let moderationPayload: unknown;
  try {
    moderationPayload = JSON.parse(providerCall.responseBody);
  } catch {
    throw new Error("Safety moderation provider returned invalid JSON payload");
  }

  const moderationSignals = extractModerationSignals(moderationPayload);
  const mergedFlags = new Set<string>(input.safetyFlags.map(toSafeSignal).filter(Boolean));
  for (const category of moderationSignals.categories) {
    mergedFlags.add(`moderation:${category}`);
  }
  if (moderationSignals.flagged) {
    mergedFlags.add("moderation:flagged");
  }

  const seededRisk = input.safetyFlags.length > 0 ? 0.2 : 0;
  const flaggedBump = moderationSignals.flagged ? 0.25 : 0;
  const riskScore = clamp01(Math.max(moderationSignals.maxCategoryScore, seededRisk + flaggedBump));
  const riskLevel = toRiskLevel(riskScore);

  return {
    riskScore: Number(riskScore.toFixed(2)),
    riskLevel,
    safetyFlags: Array.from(mergedFlags).slice(0, 12),
    rationale: normalizeWhitespace(
      `Risk derived from moderation score ${riskScore.toFixed(2)} and ${mergedFlags.size} safety signal(s).`
    ),
    moderationTelemetry: {
      providerAttempts: providerCall.attempts,
      providerRetries: providerCall.retries,
      providerStatusCode: providerCall.statusCode,
      providerUsedRetryAfter: providerCall.usedRetryAfter,
      model: moderationModel
    }
  };
}

export async function routeAndPersist(input: {
  accountId: string;
  commentId: string;
  messageId: string;
  draftText: string;
  confidenceScore: number;
  rationale: string;
  personalizationSignals: string[];
  intentLabel: IntentLabel;
  intentConfidence: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  responseStyleSkillVersionId: string | null;
  customResponseStyleSkillVersionId: string | null;
  contextSnapshotJson: string;
}) {
  const client = getClient();

  return client.mutation(
    "drafts:createReplyCandidate" as never,
    {
      accountId: input.accountId,
      commentId: input.commentId,
      messageId: input.messageId,
      draftText: input.draftText,
      intentLabel: input.intentLabel,
      intentConfidence: input.intentConfidence,
      riskScore: input.riskScore,
      riskLevel: input.riskLevel,
      personalizationSignals: input.personalizationSignals,
      contextSnapshotJson: input.contextSnapshotJson,
      responseStyleSkillVersionId: input.responseStyleSkillVersionId ?? undefined,
      customResponseStyleSkillVersionId:
        input.customResponseStyleSkillVersionId ?? undefined,
      confidenceScore: input.confidenceScore,
      rationale: input.rationale
    } as never
  ) as Promise<
    | { route: "auto_send"; candidateId: string }
    | { route: "pending_review"; candidateId: string; approvalTaskId?: string }
  >;
}
