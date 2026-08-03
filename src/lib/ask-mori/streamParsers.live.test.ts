/**
 * Live harness: the shipped parser against a real Ollama stream.
 *
 * Skipped unless `MORI_LIVE_OLLAMA=1`, because it needs a running server with a
 * specific model and would otherwise fail on any machine that has neither. It
 * exists because the unit tests prove the parser handles synthetic chunk
 * splits, and only a real socket proves it handles the splits Ollama actually
 * produces.
 *
 * Run: `MORI_LIVE_OLLAMA=1 npx vitest run src/lib/ask-mori/streamParsers.live.test.ts`
 */
import { describe, expect, it } from "vitest";
import { OllamaStreamParser } from "./streamParsers";

const live = process.env.MORI_LIVE_OLLAMA === "1";
const model = process.env.MORI_LIVE_MODEL ?? "qwen2.5:3b";
const endpoint = process.env.MORI_LIVE_ENDPOINT ?? "http://localhost:11434";

describe.skipIf(!live)("live Ollama stream", () => {
  it(
    "parses a real streamed generation and reports time to first token",
    async () => {
      const started = Date.now();
      let firstTokenAt: number | null = null;
      let text = "";

      const response = await fetch(`${endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          system: "Translate into natural Korean. Output only the translation.",
          prompt: "We should throttle the request flow before touching the handler.",
          stream: true,
          keep_alive: "10m",
          options: { num_predict: 80 },
        }),
      });
      expect(response.ok, `Ollama answered HTTP ${response.status}`).toBe(true);
      expect(response.body).toBeTruthy();

      const parser = new OllamaStreamParser();
      const decoder = new TextDecoder("utf-8");
      const reader = response.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = parser.push(decoder.decode(value, { stream: true }));
        if (delta) {
          firstTokenAt ??= Date.now();
          text += delta;
        }
      }
      text += parser.finish();

      const ttft = firstTokenAt === null ? null : firstTokenAt - started;
      // Printed rather than asserted: these are measurements, and turning a
      // machine-dependent latency into a pass/fail would make the suite flaky.
      console.log(`  time to first token : ${ttft}ms`);
      console.log(`  total               : ${Date.now() - started}ms`);
      console.log(`  stats               : ${JSON.stringify(parser.statistics)}`);
      console.log(`  text                : ${text.trim()}`);

      expect(text.trim().length).toBeGreaterThan(0);
      expect(parser.isDone).toBe(true);
      // The reason the timings are parsed at all: model load, prompt evaluation
      // and generation have to be separable to know what is actually slow.
      expect(parser.statistics?.generationMs).toBeGreaterThan(0);
      expect(parser.statistics?.loadMs).toBeDefined();
      // Streaming means text arrived before the request finished.
      expect(ttft).not.toBeNull();
      expect(ttft!).toBeLessThan(Date.now() - started + 1);
    },
    60_000,
  );
});
