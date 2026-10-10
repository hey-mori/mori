/**
 * Live harness: what the shipped prompts actually cost.
 *
 * Uses `buildLanguagePrompt` rather than a hand-written approximation, because
 * the point is to measure the prompt that ships, and an approximation measures
 * a prompt nobody runs.
 *
 * Skipped unless `MORI_LIVE_OLLAMA=1`.
 * Run: `MORI_LIVE_OLLAMA=1 node scripts/run-tests.mjs vitest src/lib/language/promptCost.live.test.ts`
 */
import { describe, expect, it } from "vitest";
import { OllamaStreamParser } from "../ask-mori/streamParsers";
import { availableDetails, buildLanguagePrompt } from "./languageAction";
import type { LanguageCaptureRequest } from "./languageCapture";

const live = process.env.MORI_LIVE_OLLAMA === "1";
const model = process.env.MORI_LIVE_MODEL ?? "qwen2.5:3b";
const endpoint = process.env.MORI_LIVE_ENDPOINT ?? "http://localhost:11434";

const SENTENCE = "Could you check the existing structure before changing it?";

function capture(text: string): LanguageCaptureRequest {
  return {
    origin: "os-selection",
    content: { contentType: "text", text },
    context: { acquiredBy: "ui-automation" },
    action: "understand",
    retentionIntent: "ephemeral",
  };
}

type Measured = { totalMs: number; genMs: number; loadMs: number; outTokens: number };

async function measure(systemPrompt: string, userPrompt: string): Promise<Measured> {
  const response = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      keep_alive: "10m",
      options: { num_predict: 700 },
    }),
  });
  const d = (await response.json()) as Record<string, number>;
  const ms = (key: string) => (d[key] ?? 0) / 1e6;
  return {
    totalMs: ms("total_duration"),
    genMs: ms("eval_duration"),
    loadMs: ms("load_duration"),
    outTokens: d.eval_count ?? 0,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function repeat(systemPrompt: string, userPrompt: string, times = 3): Promise<Measured> {
  // One discarded warm-up: the first call after a pause pays a bigger load and
  // would dominate a three-run median.
  await measure(systemPrompt, userPrompt);
  const runs: Measured[] = [];
  for (let i = 0; i < times; i += 1) runs.push(await measure(systemPrompt, userPrompt));
  return {
    totalMs: median(runs.map((r) => r.totalMs)),
    genMs: median(runs.map((r) => r.genMs)),
    loadMs: median(runs.map((r) => r.loadMs)),
    outTokens: median(runs.map((r) => r.outTokens)),
  };
}

/** Time to the first visible token, which is what streaming exists to improve. */
async function measureTimeToFirstToken(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ ttftMs: number; totalMs: number }> {
  const started = Date.now();
  let firstAt: number | null = null;

  const response = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: true,
      keep_alive: "10m",
      options: { num_predict: 560 },
    }),
  });

  const parser = new OllamaStreamParser();
  const decoder = new TextDecoder("utf-8");
  const reader = response.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (parser.push(decoder.decode(value, { stream: true }))) firstAt ??= Date.now();
  }
  parser.finish();

  return {
    ttftMs: (firstAt ?? Date.now()) - started,
    totalMs: Date.now() - started,
  };
}

describe.skipIf(!live)("what the shipped prompts cost", () => {
  it(
    "reports time to first token for the default answer",
    async () => {
      const base = buildLanguagePrompt(capture(SENTENCE));
      // Warm-up discarded for the same reason as above.
      await measureTimeToFirstToken(base.systemPrompt, base.userPrompt);
      const runs = [
        await measureTimeToFirstToken(base.systemPrompt, base.userPrompt),
        await measureTimeToFirstToken(base.systemPrompt, base.userPrompt),
        await measureTimeToFirstToken(base.systemPrompt, base.userPrompt),
      ];
      const ttft = median(runs.map((r) => r.ttftMs));
      const total = median(runs.map((r) => r.totalMs));
      console.log(`  default answer TTFT : ${ttft}ms   (total ${total}ms)`);
      expect(ttft).toBeLessThanOrEqual(total);
    },
    240_000,
  );

  it(
    "reports the default answer against the full set of follow-ups",
    async () => {
      const request = capture(SENTENCE);
      const base = buildLanguagePrompt(request);
      const baseCost = await repeat(base.systemPrompt, base.userPrompt);

      const details = availableDetails(base.selectionKind);
      const detailCosts: Array<{ detail: string; cost: Measured }> = [];
      for (const detail of details) {
        const prompt = buildLanguagePrompt(request, undefined, { detail });
        detailCosts.push({ detail, cost: await repeat(prompt.systemPrompt, prompt.userPrompt) });
      }

      const everything =
        baseCost.totalMs + detailCosts.reduce((sum, entry) => sum + entry.cost.totalMs, 0);

      console.log(
        `  default (${base.selectionKind}) : total=${baseCost.totalMs.toFixed(0)}ms ` +
          `load=${baseCost.loadMs.toFixed(0)}ms gen=${baseCost.genMs.toFixed(0)}ms ` +
          `out=${baseCost.outTokens}`,
      );
      for (const { detail, cost } of detailCosts) {
        console.log(
          `  follow-up ${detail.padEnd(13)} : total=${cost.totalMs.toFixed(0)}ms ` +
            `gen=${cost.genMs.toFixed(0)}ms out=${cost.outTokens}`,
        );
      }
      console.log(`  base only                 : ${baseCost.totalMs.toFixed(0)}ms`);
      console.log(`  base + every follow-up    : ${everything.toFixed(0)}ms`);

      // The claim being pinned is not a latency number, which is
      // machine-dependent, but the shape: the first answer is cheaper than
      // asking for everything at once.
      expect(baseCost.totalMs).toBeLessThan(everything);
      expect(baseCost.outTokens).toBeGreaterThan(0);
    },
    240_000,
  );
});
