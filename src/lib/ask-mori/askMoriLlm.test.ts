import { describe, expect, it, vi } from "vitest";
import { createAskMoriLlm, createAskMoriLlmFromSettings } from "./askMoriLlm";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../analysis/analysisSettings";

type StubCall = { url: string; init: RequestInit };

function stubFetch(response: {
  ok?: boolean;
  status?: number;
  json: unknown;
}): { fetchImpl: typeof fetch; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.json),
      text: () =>
        Promise.resolve(
          typeof response.json === "string" ? response.json : JSON.stringify(response.json),
        ),
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function bodyOf(call: StubCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body));
}

describe("createAskMoriLlm", () => {
  it("returns null for the deterministic provider", () => {
    expect(createAskMoriLlm({ kind: "deterministic" })).toBeNull();
  });
});

describe("createAskMoriLlmFromSettings", () => {
  it("returns null when the configured provider is deterministic", () => {
    expect(createAskMoriLlmFromSettings(DEFAULT_QUICK_PASS_SETTINGS)).toBeNull();
  });

  it("calls Ollama /api/generate in prose mode and returns the response text", async () => {
    const { fetchImpl, calls } = stubFetch({ json: { response: "JWT로 결정했습니다." } });
    const llm = createAskMoriLlmFromSettings(
      { ...DEFAULT_QUICK_PASS_SETTINGS, provider: "ollama" },
      { fetchImpl },
    );
    expect(llm).not.toBeNull();

    const text = await llm!({ systemPrompt: "sys", userPrompt: "usr" });
    expect(text).toBe("JWT로 결정했습니다.");
    expect(calls[0]?.url).toContain("/api/generate");
    const body = bodyOf(calls[0]!);
    expect(body.stream).toBe(false);
    // Prose mode: must NOT request JSON format (that is Quick Pass only).
    expect(body.format).toBeUndefined();
    expect(body.system).toBe("sys");
  });

  it("throws when Ollama responds non-ok", async () => {
    const { fetchImpl } = stubFetch({ ok: false, status: 500, json: {} });
    const llm = createAskMoriLlmFromSettings(
      { ...DEFAULT_QUICK_PASS_SETTINGS, provider: "ollama" },
      { fetchImpl },
    );
    await expect(llm!({ systemPrompt: "s", userPrompt: "u" })).rejects.toThrow(/HTTP 500/);
  });

  it("calls an OpenAI-compatible endpoint with the bearer token and returns content", async () => {
    const { fetchImpl, calls } = stubFetch({
      json: { choices: [{ message: { content: "응답 내용" } }] },
    });
    const llm = createAskMoriLlmFromSettings(
      { ...DEFAULT_QUICK_PASS_SETTINGS, provider: "openAiCompatible", openAiApiKey: "secret" },
      { fetchImpl },
    );
    const text = await llm!({ systemPrompt: "sys", userPrompt: "usr" });
    expect(text).toBe("응답 내용");
    expect(calls[0]?.url).toContain("/chat/completions");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret");
  });

  it("joins array-form OpenAI content parts", async () => {
    const { fetchImpl } = stubFetch({
      json: { choices: [{ message: { content: [{ text: "가" }, { text: "나" }] } }] },
    });
    const llm = createAskMoriLlmFromSettings(
      { ...DEFAULT_QUICK_PASS_SETTINGS, provider: "openAiCompatible" },
      { fetchImpl },
    );
    const text = await llm!({ systemPrompt: "s", userPrompt: "u" });
    expect(text).toBe("가\n나");
  });
});
