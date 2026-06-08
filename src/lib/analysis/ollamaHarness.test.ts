import { describe, expect, it } from "vitest";
import { createOllamaQuickPassProvider } from "./ollamaProvider";
import { buildQuickPassSampleInput } from "./quickPassCapability";

/**
 * End-to-end harness regression: a weak local model rarely returns clean JSON.
 * These drive the full `OllamaQuickPassProvider.analyze()` path (HTTP shape,
 * extraction, sanitization) with a mocked fetch, proving the recovery + quality
 * floor work together — not just in isolation. This is the exact failure the
 * user hit ("Ollama Quick Pass response is not a JSON object") with a model that
 * wrapped its answer in a code fence / reasoning block.
 */

/** Wrap a raw Ollama `response` string in the /api/generate envelope. */
function ollamaFetchRaw(responseText: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ response: responseText }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

function provider(responseText: string) {
  return createOllamaQuickPassProvider({
    endpoint: "http://localhost:11434",
    model: "gemma:test",
    fetchImpl: ollamaFetchRaw(responseText),
  });
}

describe("Ollama Quick Pass harness recovery", () => {
  it("recovers a fenced answer wrapped in a reasoning block with a trailing comma", async () => {
    const messy = [
      "<think>The user discussed a redirect loop. I will extract one issue.</think>",
      "```json",
      '{"summary":{"sessionSummary":"리다이렉트 점검","resumePrompt":"이어서","highlights":[]},',
      '"issues":[{"title":"리다이렉트 루프 위험","priority":"high"}],',
      '"decisions":[],"relationships":[],"nextActions":[],}',
      "```",
    ].join("\n");

    const result = await provider(messy).analyze(buildQuickPassSampleInput());

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.title).toBe("리다이렉트 루프 위험");
    expect(result.issues[0]?.priority).toBe("high");
  });

  it("drops title-less and duplicate items the model emitted", async () => {
    const noisy = JSON.stringify({
      summary: { sessionSummary: "s", resumePrompt: "r", highlights: [] },
      issues: [
        { title: "중복 이슈", priority: "high" },
        { title: "중복 이슈", priority: "low" },
        { title: "  ", priority: "high" },
        { description: "no title" },
      ],
      decisions: [],
      nextActions: [],
    });

    const result = await provider(noisy).analyze(buildQuickPassSampleInput());

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.title).toBe("중복 이슈");
  });

  it("still rejects a reply with no JSON object at all", async () => {
    await expect(provider("I could not analyze this.").analyze(buildQuickPassSampleInput())).rejects.toThrow();
  });
});
