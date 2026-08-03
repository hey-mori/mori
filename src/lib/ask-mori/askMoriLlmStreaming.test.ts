import { describe, expect, it, vi } from "vitest";
import { createAskMoriLlmFromSettings } from "./askMoriLlm";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../analysis/analysisSettings";
import type { QuickPassAnalysisSettings } from "../analysis/analysisSettings";

function ollamaSettings(patch: Partial<QuickPassAnalysisSettings> = {}): QuickPassAnalysisSettings {
  return {
    ...DEFAULT_QUICK_PASS_SETTINGS,
    provider: "ollama",
    ollamaEndpoint: "http://localhost:11434",
    ollamaModel: "qwen2.5:3b",
    ...patch,
  };
}

/** A `fetch` double that records what it was called with. */
function recordingFetch(json: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(json),
      text: () => Promise.resolve(JSON.stringify(json)),
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("the non-streaming path is unchanged for Ask Mori", () => {
  it("still resolves the whole answer from one response", async () => {
    const { fetchImpl } = recordingFetch({ response: "전체 답변" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    await expect(llm!({ systemPrompt: "s", userPrompt: "u" })).resolves.toBe("전체 답변");
  });

  it("asks for a non-streaming response when no chunk handler is given", async () => {
    const { fetchImpl, calls } = recordingFetch({ response: "x" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    await llm!({ systemPrompt: "s", userPrompt: "u" });
    expect(bodyOf(calls[0].init).stream).toBe(false);
  });

  it("accepts a single argument, as every existing caller passes", async () => {
    // The options parameter has to stay optional or Ask Mori stops compiling.
    const { fetchImpl } = recordingFetch({ response: "ok" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    await expect(llm!({ systemPrompt: "s", userPrompt: "u" })).resolves.toBe("ok");
  });
});

describe("the caller's cancellation reaches the request", () => {
  it("rejects immediately when the signal is already aborted", async () => {
    const { fetchImpl, calls } = recordingFetch({ response: "never" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    const controller = new AbortController();
    controller.abort();

    await expect(
      llm!({ systemPrompt: "s", userPrompt: "u" }, { signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
    // Nothing should have been sent at all.
    expect(calls).toHaveLength(0);
  });

  it("aborts the in-flight request when the caller aborts", async () => {
    // The bug this pins: the old implementation built its own controller and
    // dropped the caller's, so the UI's cancellation never reached `fetch` and
    // a superseded generation kept running.
    let seenSignal: AbortSignal | undefined;
    // Never resolves on its own; the abort is the only way out.
    const fetchImpl = ((_url: string, init: RequestInit) => {
      seenSignal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        seenSignal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }) as unknown as typeof fetch;

    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    const controller = new AbortController();
    const pending = llm!({ systemPrompt: "s", userPrompt: "u" }, { signal: controller.signal });

    // Let the call reach fetch before cancelling.
    await Promise.resolve();
    expect(seenSignal).toBeDefined();
    expect(seenSignal!.aborted).toBe(false);

    controller.abort();
    expect(seenSignal!.aborted).toBe(true);
    await expect(pending).rejects.toThrow(/abort/i);
  });

  it("does not leave a listener on the caller's signal after finishing", async () => {
    // The signal outlives one call; accumulating listeners would leak one per
    // request for the whole session.
    const { fetchImpl } = recordingFetch({ response: "x" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await llm!({ systemPrompt: "s", userPrompt: "u" }, { signal: controller.signal });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

describe("cost controls reach the wire", () => {
  it("keeps the model resident between calls", async () => {
    const { fetchImpl, calls } = recordingFetch({ response: "x" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    await llm!({ systemPrompt: "s", userPrompt: "u" });
    expect(bodyOf(calls[0].init).keep_alive).toBe("10m");
  });

  it("applies an output budget when one is given", async () => {
    const { fetchImpl, calls } = recordingFetch({ response: "x" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    await llm!({ systemPrompt: "s", userPrompt: "u" }, { maxOutputTokens: 320 });
    expect(bodyOf(calls[0].init).options).toEqual({ num_predict: 320 });
  });

  it("sends no budget when none is given, rather than a guessed default", async () => {
    const { fetchImpl, calls } = recordingFetch({ response: "x" });
    const llm = createAskMoriLlmFromSettings(ollamaSettings(), { fetchImpl });
    await llm!({ systemPrompt: "s", userPrompt: "u" });
    expect(bodyOf(calls[0].init).options).toBeUndefined();
  });

  it("uses max_tokens for an OpenAI-compatible endpoint", async () => {
    const { fetchImpl, calls } = recordingFetch({
      choices: [{ message: { content: "x" } }],
    });
    const llm = createAskMoriLlmFromSettings(
      {
        ...DEFAULT_QUICK_PASS_SETTINGS,
        provider: "openAiCompatible",
        openAiBaseUrl: "http://localhost:1234/v1",
        openAiModel: "local",
      },
      { fetchImpl },
    );
    await llm!({ systemPrompt: "s", userPrompt: "u" }, { maxOutputTokens: 128 });
    expect(bodyOf(calls[0].init).max_tokens).toBe(128);
  });
});
