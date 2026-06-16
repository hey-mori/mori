import type { DisclosureLevel } from "../disclosure";

export type QuickPassProviderKind = "deterministic" | "ollama" | "openAiCompatible";

export type QuickPassAnalysisSettings = {
  provider: QuickPassProviderKind;
  ollamaEndpoint: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  openAiBaseUrl: string;
  openAiModel: string;
  openAiApiKey: string;
  openAiTimeoutMs: number;
  fallbackToDeterministic: boolean;
  /**
   * How a user's own request text is disclosed in detail views (Event
   * Inspector). Storage always keeps the full text; this only controls
   * what is rendered. Defaults to `raw` so display is unchanged until the
   * user dials it down.
   */
  requestDisclosureLevel: DisclosureLevel;
  /**
   * Optional per-task model override for request abstraction (a small,
   * fast model fits the one-line intent task). Empty means "use the main
   * Ollama model". Resolved via `resolveTaskModel`.
   */
  requestAbstractionModel: string;
};

/** Local-LLM tasks that can route to different models. */
export type AnalysisTask = "quickPass" | "requestAbstraction";

export const DEFAULT_QUICK_PASS_SETTINGS: QuickPassAnalysisSettings = {
  provider: "deterministic",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
  ollamaTimeoutMs: 60_000,
  openAiBaseUrl: "http://localhost:1234/v1",
  openAiModel: "local-model",
  openAiApiKey: "",
  openAiTimeoutMs: 120_000,
  fallbackToDeterministic: false,
  requestDisclosureLevel: "raw",
  requestAbstractionModel: "",
};

const ALLOWED_PROVIDERS = [
  "deterministic",
  "ollama",
  "openAiCompatible",
] as const satisfies readonly [QuickPassProviderKind, ...QuickPassProviderKind[]];

export function sanitizeQuickPassSettings(input: unknown): QuickPassAnalysisSettings {
  if (!isRecord(input)) return { ...DEFAULT_QUICK_PASS_SETTINGS };
  return {
    provider: parseProvider(input.provider),
    ollamaEndpoint: parseNonEmptyString(
      input.ollamaEndpoint,
      DEFAULT_QUICK_PASS_SETTINGS.ollamaEndpoint,
    ),
    ollamaModel: parseNonEmptyString(
      input.ollamaModel,
      DEFAULT_QUICK_PASS_SETTINGS.ollamaModel,
    ),
    ollamaTimeoutMs: parseBoundedNumber(
      input.ollamaTimeoutMs,
      DEFAULT_QUICK_PASS_SETTINGS.ollamaTimeoutMs,
      1_000,
      300_000,
    ),
    openAiBaseUrl: parseNonEmptyString(
      input.openAiBaseUrl,
      DEFAULT_QUICK_PASS_SETTINGS.openAiBaseUrl,
    ),
    openAiModel: parseNonEmptyString(
      input.openAiModel,
      DEFAULT_QUICK_PASS_SETTINGS.openAiModel,
    ),
    openAiApiKey: parseString(input.openAiApiKey, DEFAULT_QUICK_PASS_SETTINGS.openAiApiKey),
    openAiTimeoutMs: parseBoundedNumber(
      input.openAiTimeoutMs,
      DEFAULT_QUICK_PASS_SETTINGS.openAiTimeoutMs,
      1_000,
      300_000,
    ),
    fallbackToDeterministic:
      typeof input.fallbackToDeterministic === "boolean"
        ? input.fallbackToDeterministic
        : DEFAULT_QUICK_PASS_SETTINGS.fallbackToDeterministic,
    requestDisclosureLevel: parseDisclosureLevel(input.requestDisclosureLevel),
    requestAbstractionModel: parseString(
      input.requestAbstractionModel,
      DEFAULT_QUICK_PASS_SETTINGS.requestAbstractionModel,
    ),
  };
}

/**
 * Resolve which Ollama model a task should use. Request abstraction can
 * route to a small dedicated model; an empty override (or any other task)
 * falls back to the main `ollamaModel`.
 */
export function resolveTaskModel(
  settings: QuickPassAnalysisSettings,
  task: AnalysisTask,
): string {
  if (task === "requestAbstraction") {
    const override = settings.requestAbstractionModel.trim();
    if (override) return override;
  }
  return settings.ollamaModel;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseProvider(value: unknown): QuickPassProviderKind {
  return typeof value === "string" && isAllowedProvider(value)
    ? value
    : DEFAULT_QUICK_PASS_SETTINGS.provider;
}

function parseDisclosureLevel(value: unknown): DisclosureLevel {
  return value === "raw" || value === "summary" || value === "abstract" || value === "hidden"
    ? value
    : DEFAULT_QUICK_PASS_SETTINGS.requestDisclosureLevel;
}

function parseNonEmptyString(value: unknown, fallback: string): string {
  const trimmed = parseString(value, fallback);
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampNumber(value, min, max)
    : fallback;
}

function isAllowedProvider(value: string): value is QuickPassProviderKind {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
