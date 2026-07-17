import { describe, expect, it, vi } from "vitest";
import { DEFAULT_QUICK_PASS_SETTINGS } from "../analysis/analysisSettings";
import { engineFromSettings, runUnderstanding } from "./runUnderstanding";
import { SUMMARY_MIN_CHARS } from "./understandingTypes";

const KNOWN = ["workout", "task", "note"];
const body = "코틀린은 null을 허용하지 않습니다. " + "가".repeat(SUMMARY_MIN_CHARS);

const base = {
  title: "코틀린",
  body,
  itemKinds: [{ id: "workout", label: "운동" }],
  knownSchemaIds: KNOWN,
  now: "2026-07-17T09:00:00.000Z",
};

const ollama = { kind: "ollama", endpoint: "http://localhost:11434", model: "m", timeoutMs: 1000 } as const;

function replyWith(payload: unknown, ok = true) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    ({ ok, json: async () => ({ response: JSON.stringify(payload) }) }) as unknown as Response,
  );
}

describe("engineFromSettings", () => {
  it("reads a configured Ollama engine out of the settings that already ship", () => {
    const engine = engineFromSettings({
      ...DEFAULT_QUICK_PASS_SETTINGS,
      provider: "ollama",
      ollamaModel: "midm:2.3b",
    });
    expect(engine).toMatchObject({ kind: "ollama", model: "midm:2.3b" });
  });

  it("treats the deterministic provider as NO engine", () => {
    // It cannot summarize or gloss a term. Calling it an engine here would put
    // keyword output under a heading that promises understanding.
    expect(engineFromSettings(DEFAULT_QUICK_PASS_SETTINGS)).toEqual({ kind: "none" });
  });

  it("treats a half-configured engine as none rather than guessing", () => {
    expect(
      engineFromSettings({ ...DEFAULT_QUICK_PASS_SETTINGS, provider: "ollama", ollamaModel: "" }),
    ).toEqual({ kind: "none" });
  });
});

describe("runUnderstanding", () => {
  it("returns null with no engine, without calling anything", async () => {
    const fetchImpl = vi.fn();
    const out = await runUnderstanding({ ...base, engine: { kind: "none" }, fetchImpl });
    expect(out).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads a document and verifies every output against the body", async () => {
    const fetchImpl = replyWith({
      nature: "study",
      natureConfidence: 0.8,
      summary: "코틀린 소개",
      terms: [{ term: "null", gloss: "값이 없음" }],
      insights: [{ text: "널 안전성이 핵심", quote: "null을 허용하지 않습니다" }],
    });
    const out = await runUnderstanding({ ...base, engine: ollama, fetchImpl });
    expect(out?.nature).toBe("study");
    expect(out?.summary).toBe("코틀린 소개");
    expect(out?.insights).toHaveLength(1);
    expect(body.slice(out!.insights[0].span.start, out!.insights[0].span.end)).toContain("null");
  });

  it("constrains the reply to JSON at temperature 0", async () => {
    const fetchImpl = replyWith({ nature: "study" });
    await runUnderstanding({ ...base, engine: ollama, fetchImpl });
    const init = fetchImpl.mock.calls[0][1];
    const sent = JSON.parse(String(init?.body));
    expect(sent.format).toBe("json");
    expect(sent.options.temperature).toBe(0);
    expect(sent.stream).toBe(false);
  });

  it("returns null on a dead endpoint instead of throwing at the surface", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await runUnderstanding({ ...base, engine: ollama, fetchImpl })).toBeNull();
  });

  it("returns null on a non-OK response", async () => {
    expect(
      await runUnderstanding({ ...base, engine: ollama, fetchImpl: replyWith({}, false) }),
    ).toBeNull();
  });

  it("returns null on a truncated reply rather than a partial reading", async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: true, json: async () => ({ response: '{"nature":"stu', done_reason: "length" }) }) as unknown as Response,
    );
    expect(await runUnderstanding({ ...base, engine: ollama, fetchImpl })).toBeNull();
  });

  it("returns null when the reply is not JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: true, json: async () => ({ response: "죄송하지만 도와드릴 수 없습니다" }) }) as unknown as Response,
    );
    expect(await runUnderstanding({ ...base, engine: ollama, fetchImpl })).toBeNull();
  });

  it("drops a hallucinated insight while keeping the rest of the reading", async () => {
    const fetchImpl = replyWith({
      nature: "study",
      summary: "코틀린 소개",
      insights: [
        { text: "실재", quote: "null을 허용하지 않습니다" },
        { text: "지어냄", quote: "사용자는 코틀린을 싫어한다고 적었다" },
      ],
    });
    const out = await runUnderstanding({ ...base, engine: ollama, fetchImpl });
    expect(out?.summary).toBe("코틀린 소개");
    expect(out?.insights.map((i) => i.text)).toEqual(["실재"]);
  });
});
