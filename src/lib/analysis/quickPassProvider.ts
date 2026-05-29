import {
  createDeterministicQuickPassProvider,
  DeterministicQuickPassProvider,
} from "./deterministicQuickPassProvider";
import {
  createOllamaQuickPassProvider,
  OllamaQuickPassProvider,
  type OllamaProviderConfig,
} from "./ollamaProvider";
import type { AnalysisProvider, AnalysisProviderName } from "./analysisTypes";

export type QuickPassProviderConfig =
  | { kind: "deterministic" }
  | { kind: "ollama"; config: OllamaProviderConfig };

export function resolveQuickPassProvider(config: QuickPassProviderConfig): AnalysisProvider {
  if (config.kind === "ollama") return createOllamaQuickPassProvider(config.config);
  return createDeterministicQuickPassProvider();
}

export function providerNameLabel(name: AnalysisProviderName): string {
  if (name === "ollama-quick-pass-v1") return "Ollama Quick Pass";
  return "Deterministic Quick Pass";
}

export { DeterministicQuickPassProvider, OllamaQuickPassProvider, createDeterministicQuickPassProvider, createOllamaQuickPassProvider };
