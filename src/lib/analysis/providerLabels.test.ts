import { describe, expect, it } from "vitest";
import { providerKindLabel, providerNameLabel } from "./providerLabels";

describe("providerKindLabel", () => {
  it("uses protocol names, not location-based names", () => {
    expect(providerKindLabel("deterministic")).toBe("규칙 기반");
    expect(providerKindLabel("ollama")).toBe("Ollama");
    expect(providerKindLabel("openAiCompatible")).toBe("OpenAI 호환");
  });
});

describe("providerNameLabel", () => {
  it("maps a run provider name to the same canonical label as its kind", () => {
    expect(providerNameLabel("deterministic-heuristic-v1")).toBe("규칙 기반");
    expect(providerNameLabel("ollama-quick-pass-v1")).toBe("Ollama");
    expect(providerNameLabel("openai-compatible-quick-pass-v1")).toBe("OpenAI 호환");
  });

  it("stays honest for an unknown or missing provider name", () => {
    expect(providerNameLabel(null)).toBe("알 수 없는 제공자");
    expect(providerNameLabel(undefined)).toBe("알 수 없는 제공자");
    expect(providerNameLabel("some-future-provider")).toBe("알 수 없는 제공자");
  });
});
