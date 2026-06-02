import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_PASS_SETTINGS, sanitizeQuickPassSettings } from "./analysisSettings";

describe("sanitizeQuickPassSettings", () => {
  it("returns defaults for missing or wrong shape input", () => {
    expect(sanitizeQuickPassSettings(null)).toEqual(DEFAULT_QUICK_PASS_SETTINGS);
    expect(sanitizeQuickPassSettings("oops")).toEqual(DEFAULT_QUICK_PASS_SETTINGS);
    expect(sanitizeQuickPassSettings({})).toEqual(DEFAULT_QUICK_PASS_SETTINGS);
  });

  it("clamps the Ollama timeout to a sane range", () => {
    const tooSmall = sanitizeQuickPassSettings({ ollamaTimeoutMs: 10 });
    expect(tooSmall.ollamaTimeoutMs).toBeGreaterThanOrEqual(1_000);
    const tooBig = sanitizeQuickPassSettings({ ollamaTimeoutMs: 999_999 });
    expect(tooBig.ollamaTimeoutMs).toBeLessThanOrEqual(300_000);
  });

  it("falls back to defaults for unknown provider values", () => {
    const sanitized = sanitizeQuickPassSettings({ provider: "openai" as unknown as "ollama" });
    expect(sanitized.provider).toBe(DEFAULT_QUICK_PASS_SETTINGS.provider);
  });

  it("defaults the request disclosure level and rejects unknown values", () => {
    expect(sanitizeQuickPassSettings({}).requestDisclosureLevel).toBe("raw");
    expect(
      sanitizeQuickPassSettings({ requestDisclosureLevel: "abstract" }).requestDisclosureLevel,
    ).toBe("abstract");
    expect(
      sanitizeQuickPassSettings({
        requestDisclosureLevel: "bogus" as unknown as "raw",
      }).requestDisclosureLevel,
    ).toBe("raw");
  });

  it("keeps user-provided endpoint and model strings when present", () => {
    const sanitized = sanitizeQuickPassSettings({
      provider: "ollama",
      ollamaEndpoint: "http://my-host:11434",
      ollamaModel: "qwen2.5-coder",
      fallbackToDeterministic: false,
    });
    expect(sanitized.provider).toBe("ollama");
    expect(sanitized.ollamaEndpoint).toBe("http://my-host:11434");
    expect(sanitized.ollamaModel).toBe("qwen2.5-coder");
    expect(sanitized.fallbackToDeterministic).toBe(false);
  });

  it("keeps OpenAI-compatible endpoint settings and clamps timeout", () => {
    const sanitized = sanitizeQuickPassSettings({
      provider: "openAiCompatible",
      openAiBaseUrl: " https://api.example.test/v1 ",
      openAiModel: "gpt-test",
      openAiApiKey: " sk-test ",
      openAiTimeoutMs: 999_999,
    });
    expect(sanitized.provider).toBe("openAiCompatible");
    expect(sanitized.openAiBaseUrl).toBe("https://api.example.test/v1");
    expect(sanitized.openAiModel).toBe("gpt-test");
    expect(sanitized.openAiApiKey).toBe("sk-test");
    expect(sanitized.openAiTimeoutMs).toBe(300_000);
  });
});
