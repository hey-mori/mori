import { z } from "zod";
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
};

export const DEFAULT_QUICK_PASS_SETTINGS: QuickPassAnalysisSettings = {
  provider: "deterministic",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
  ollamaTimeoutMs: 60_000,
  openAiBaseUrl: "http://localhost:1234/v1",
  openAiModel: "local-model",
  openAiApiKey: "",
  openAiTimeoutMs: 60_000,
  fallbackToDeterministic: true,
  requestDisclosureLevel: "raw",
};

const ALLOWED_PROVIDERS = [
  "deterministic",
  "ollama",
  "openAiCompatible",
] as const satisfies readonly [QuickPassProviderKind, ...QuickPassProviderKind[]];

const QuickPassSettingsSchema = z.object({
  provider: z.enum(ALLOWED_PROVIDERS).catch(DEFAULT_QUICK_PASS_SETTINGS.provider),
  ollamaEndpoint: trimmedNonEmptyString(DEFAULT_QUICK_PASS_SETTINGS.ollamaEndpoint),
  ollamaModel: trimmedNonEmptyString(DEFAULT_QUICK_PASS_SETTINGS.ollamaModel),
  ollamaTimeoutMs: boundedNumber(
    DEFAULT_QUICK_PASS_SETTINGS.ollamaTimeoutMs,
    1_000,
    300_000,
  ),
  openAiBaseUrl: trimmedNonEmptyString(DEFAULT_QUICK_PASS_SETTINGS.openAiBaseUrl),
  openAiModel: trimmedNonEmptyString(DEFAULT_QUICK_PASS_SETTINGS.openAiModel),
  openAiApiKey: trimmedString(DEFAULT_QUICK_PASS_SETTINGS.openAiApiKey),
  openAiTimeoutMs: boundedNumber(
    DEFAULT_QUICK_PASS_SETTINGS.openAiTimeoutMs,
    1_000,
    300_000,
  ),
  fallbackToDeterministic: z
    .boolean()
    .catch(DEFAULT_QUICK_PASS_SETTINGS.fallbackToDeterministic),
  requestDisclosureLevel: z
    .enum(["raw", "summary", "abstract", "hidden"])
    .catch(DEFAULT_QUICK_PASS_SETTINGS.requestDisclosureLevel),
});

export function sanitizeQuickPassSettings(input: unknown): QuickPassAnalysisSettings {
  const parsed = QuickPassSettingsSchema.safeParse(input);
  return parsed.success ? parsed.data : { ...DEFAULT_QUICK_PASS_SETTINGS };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function trimmedNonEmptyString(fallback: string) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1).catch(fallback),
  );
}

function trimmedString(fallback: string) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().catch(fallback),
  );
}

function boundedNumber(fallback: number, min: number, max: number) {
  return z
    .number()
    .finite()
    .transform((value) => clampNumber(value, min, max))
    .catch(fallback);
}
