import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_PASS_SETTINGS, type QuickPassAnalysisSettings } from "./analysisSettings";
import {
  buildQuickPassSampleInput,
  checkQuickPassCapability,
  deriveFailureHint,
} from "./quickPassCapability";

function settings(patch: Partial<QuickPassAnalysisSettings> = {}): QuickPassAnalysisSettings {
  return { ...DEFAULT_QUICK_PASS_SETTINGS, ...patch };
}

const GOOD_JSON = {
  summary: {
    sessionSummary: "로그인 리다이렉트 정책을 점검했습니다.",
    resumePrompt: "리다이렉트 루프 검증을 이어가세요.",
    highlights: ["리다이렉트 정책 결정"],
  },
  issues: [{ title: "리다이렉트 루프 위험", priority: "high" }],
  decisions: [{ title: "만료 시 리다이렉트", decision: "redirect on session expiry" }],
  nextActions: [{ title: "원래 경로 복원" }],
};

function ollamaFetch(json: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ response: JSON.stringify(json) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

function openAiFetch(json: unknown): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
}

describe("buildQuickPassSampleInput", () => {
  it("produces a fixed synthetic input with engine-recognisable signals", () => {
    const input = buildQuickPassSampleInput();
    expect(input.events.length).toBeGreaterThanOrEqual(2);
    expect(input.sources.length).toBeGreaterThanOrEqual(1);
    // Synthetic ids only — never real user data.
    expect(input.session.id).toBe("sample-session");
    expect(input.events.every((event) => event.id.startsWith("sample-evt-"))).toBe(true);
    const text = input.events.map((event) => event.summary).join(" ");
    expect(text).toMatch(/결정/);
    expect(text).toMatch(/TODO|위험/);
  });
});

describe("checkQuickPassCapability", () => {
  it("grades the rule-based engine as ready without any network", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "deterministic" }), {
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(report.verdict).toBe("ready");
    expect(report.error).toBeNull();
    expect(report.counts.issues + report.counts.decisions).toBeGreaterThan(0);
  });

  it("grades a healthy Ollama JSON response as ready", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "ollama" }), {
      fetchImpl: ollamaFetch(GOOD_JSON),
    });
    expect(report.verdict).toBe("ready");
    expect(report.counts.issues).toBe(1);
    expect(report.counts.decisions).toBe(1);
    expect(report.hasSummary).toBe(true);
    expect(report.hint).toBeNull();
  });

  it("grades a healthy OpenAI-compatible response as ready", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "openAiCompatible" }), {
      fetchImpl: openAiFetch(GOOD_JSON),
    });
    expect(report.verdict).toBe("ready");
    expect(report.providerLabel).toContain("OpenAI-compatible");
  });

  it("flags a parseable-but-empty response as reachableNoStructure", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "ollama" }), {
      fetchImpl: ollamaFetch({}),
    });
    expect(report.verdict).toBe("reachableNoStructure");
    expect(report.hint).toMatch(/더 큰 모델|타임아웃/);
    expect(report.error).toBeNull();
  });

  it("fails with a model-name hint on HTTP 404 for Ollama", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "ollama" }), {
      fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch,
    });
    expect(report.verdict).toBe("failed");
    expect(report.hint).toMatch(/모델/);
    expect(report.error).toMatch(/404/);
  });

  it("fails with a /v1 path hint on HTTP 404 for OpenAI-compatible", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "openAiCompatible" }), {
      fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch,
    });
    expect(report.verdict).toBe("failed");
    expect(report.hint).toMatch(/\/v1/);
  });

  it("fails with a JSON hint when the model returns non-JSON", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "ollama" }), {
      fetchImpl: (async () =>
        new Response(JSON.stringify({ response: "정말 죄송하지만 JSON이 아닙니다" }), {
          status: 200,
        })) as typeof fetch,
    });
    expect(report.verdict).toBe("failed");
    expect(report.hint).toMatch(/JSON/);
  });

  it("fails with a connection hint when fetch throws", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "ollama" }), {
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
    });
    expect(report.verdict).toBe("failed");
    expect(report.hint).toMatch(/연결할 수 없습니다/);
  });

  it("fails with a timeout hint on an abort", async () => {
    const report = await checkQuickPassCapability(settings({ provider: "ollama" }), {
      fetchImpl: (async () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        throw error;
      }) as typeof fetch,
    });
    expect(report.verdict).toBe("failed");
    expect(report.hint).toMatch(/제한 시간|타임아웃/);
  });
});

describe("deriveFailureHint", () => {
  it("maps auth failures to an API key hint", () => {
    const hint = deriveFailureHint("request failed with HTTP 401", settings({ provider: "openAiCompatible" }));
    expect(hint).toMatch(/API key/);
  });

  it("maps server errors to a server-log hint", () => {
    const hint = deriveFailureHint("request failed with HTTP 503", settings({ provider: "ollama" }));
    expect(hint).toMatch(/서버/);
  });
});
