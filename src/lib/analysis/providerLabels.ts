/**
 * Canonical display labels for the analysis engines.
 *
 * Engines are named by how Mori connects to them (protocol), never by where
 * they run: an OpenAI-compatible endpoint can be a local server (LM Studio,
 * llama.cpp) or a remote API, so "로컬 LLM" / "API 연결" are misleading. Whether
 * data leaves the machine is a derived property of the endpoint (see
 * `endpointLocality.ts`), surfaced as a badge — not the engine's name.
 *
 * Every surface (the Start Session picker, the Settings card, the session-detail
 * analysis tabs, report / review provenance, the run plan) must read its label
 * from here so they can never drift apart again. Adding an engine is a single
 * edit: extend the kind map below and, if it has a provider runId, the name map.
 */
import type { AnalysisProviderName } from "./analysisTypes";
import type { QuickPassProviderKind } from "./analysisSettings";

/** The one true engine label per provider kind. Protocol names only. */
export const ANALYSIS_ENGINE_LABELS: Record<QuickPassProviderKind, string> = {
  deterministic: "규칙 기반",
  ollama: "Ollama",
  openAiCompatible: "OpenAI 호환",
};

/** Display label for a provider kind (the picker / settings enum). */
export function providerKindLabel(kind: QuickPassProviderKind): string {
  return ANALYSIS_ENGINE_LABELS[kind] ?? ANALYSIS_ENGINE_LABELS.deterministic;
}

const PROVIDER_NAME_TO_KIND: Record<AnalysisProviderName, QuickPassProviderKind> = {
  "deterministic-heuristic-v1": "deterministic",
  "ollama-quick-pass-v1": "ollama",
  "openai-compatible-quick-pass-v1": "openAiCompatible",
};

/**
 * Display label for an analysis-run provider name (the `*-v1` runId stamped on a
 * result). Maps to the same canonical label as the kind, so a report's
 * provenance reads identically to the picker. Unknown names stay honest.
 */
export function providerNameLabel(
  name: AnalysisProviderName | string | null | undefined,
): string {
  if (!name) return "알 수 없는 제공자";
  const kind = PROVIDER_NAME_TO_KIND[name as AnalysisProviderName];
  return kind ? providerKindLabel(kind) : "알 수 없는 제공자";
}
