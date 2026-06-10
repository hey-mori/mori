import { describe, expect, it } from "vitest";
import {
  ENGINE_PROVIDERS,
  getEngineProvider,
  isLlmProvider,
  llmEngineProviders,
  providerNeedsField,
} from "./engineProviders";

describe("engine provider registry", () => {
  it("registers the built-in and the two LLM connections", () => {
    expect(ENGINE_PROVIDERS.map((p) => p.kind)).toEqual([
      "deterministic",
      "ollama",
      "openAiCompatible",
    ]);
  });

  it("marks only the model-backed providers as LLM", () => {
    expect(isLlmProvider("deterministic")).toBe(false);
    expect(isLlmProvider("ollama")).toBe(true);
    expect(isLlmProvider("openAiCompatible")).toBe(true);
    expect(llmEngineProviders().map((p) => p.kind)).toEqual(["ollama", "openAiCompatible"]);
  });

  it("declares the fields each provider needs", () => {
    expect(providerNeedsField("deterministic", "endpoint")).toBe(false);
    expect(providerNeedsField("ollama", "endpoint")).toBe(true);
    expect(providerNeedsField("ollama", "apiKey")).toBe(false);
    expect(providerNeedsField("openAiCompatible", "apiKey")).toBe(true);
  });

  it("falls back to the built-in descriptor for an unknown kind", () => {
    expect(getEngineProvider("nope" as never).kind).toBe("deterministic");
  });
});
