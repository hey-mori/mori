export type QuickPassProviderKind = "deterministic" | "ollama";

export type QuickPassAnalysisSettings = {
  provider: QuickPassProviderKind;
  ollamaEndpoint: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  fallbackToDeterministic: boolean;
};

export const DEFAULT_QUICK_PASS_SETTINGS: QuickPassAnalysisSettings = {
  provider: "deterministic",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
  ollamaTimeoutMs: 60_000,
  fallbackToDeterministic: true,
};

const ALLOWED_PROVIDERS: QuickPassProviderKind[] = ["deterministic", "ollama"];

export function sanitizeQuickPassSettings(input: unknown): QuickPassAnalysisSettings {
  if (!input || typeof input !== "object") return { ...DEFAULT_QUICK_PASS_SETTINGS };
  const candidate = input as Partial<QuickPassAnalysisSettings>;

  const provider: QuickPassProviderKind =
    candidate.provider && ALLOWED_PROVIDERS.includes(candidate.provider)
      ? candidate.provider
      : DEFAULT_QUICK_PASS_SETTINGS.provider;

  const endpoint =
    typeof candidate.ollamaEndpoint === "string" && candidate.ollamaEndpoint.trim().length
      ? candidate.ollamaEndpoint.trim()
      : DEFAULT_QUICK_PASS_SETTINGS.ollamaEndpoint;

  const model =
    typeof candidate.ollamaModel === "string" && candidate.ollamaModel.trim().length
      ? candidate.ollamaModel.trim()
      : DEFAULT_QUICK_PASS_SETTINGS.ollamaModel;

  const timeout =
    typeof candidate.ollamaTimeoutMs === "number" && Number.isFinite(candidate.ollamaTimeoutMs)
      ? clampNumber(candidate.ollamaTimeoutMs, 1_000, 300_000)
      : DEFAULT_QUICK_PASS_SETTINGS.ollamaTimeoutMs;

  const fallback =
    typeof candidate.fallbackToDeterministic === "boolean"
      ? candidate.fallbackToDeterministic
      : DEFAULT_QUICK_PASS_SETTINGS.fallbackToDeterministic;

  return {
    provider,
    ollamaEndpoint: endpoint,
    ollamaModel: model,
    ollamaTimeoutMs: timeout,
    fallbackToDeterministic: fallback,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
