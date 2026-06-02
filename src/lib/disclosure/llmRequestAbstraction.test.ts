import { describe, expect, it } from "vitest";
import {
  buildLlmRequestAbstraction,
  parseAbstractionJson,
} from "./llmRequestAbstraction";

const config = { endpoint: "http://localhost:11434", model: "llama3.1:8b" };

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;
}

describe("parseAbstractionJson", () => {
  it("parses a clean JSON object", () => {
    expect(parseAbstractionJson('{"summary":"s","abstract":"a"}')).toEqual({
      summary: "s",
      abstract: "a",
    });
  });

  it("recovers JSON embedded in surrounding text", () => {
    expect(parseAbstractionJson('noise {"abstract":"a"} tail')).toEqual({
      summary: undefined,
      abstract: "a",
    });
  });

  it("throws on non-JSON", () => {
    expect(() => parseAbstractionJson("not json at all")).toThrow();
  });
});

describe("buildLlmRequestAbstraction", () => {
  it("uses the LLM result when the model returns a usable abstract", async () => {
    const result = await buildLlmRequestAbstraction(
      "인증 토큰 회전 로직 만들어줘",
      config,
      {
        fetchImpl: fakeFetch({
          response: JSON.stringify({ summary: "토큰 회전 요약", abstract: "사용자가 작업을 요청함" }),
        }),
      },
    );
    expect(result.source).toBe("llm");
    expect(result.summary).toBe("토큰 회전 요약");
    expect(result.abstract).toBe("사용자가 작업을 요청함");
  });

  it("falls back to the deterministic abstract when the LLM omits it", async () => {
    const result = await buildLlmRequestAbstraction(
      "로그인 버그 고쳐줘",
      config,
      { fetchImpl: fakeFetch({ response: JSON.stringify({ summary: "버그 요약" }) }) },
    );
    expect(result.source).toBe("deterministic");
    expect(result.summary).toBe("버그 요약"); // LLM summary kept
    expect(result.abstract).toBe("사용자가 수정·디버깅을 요청함"); // deterministic abstract
    expect(result.note).toBeTruthy();
  });

  it("falls back when the response is not JSON", async () => {
    const result = await buildLlmRequestAbstraction("뭔가 해줘", config, {
      fetchImpl: fakeFetch({ response: "sorry, I cannot" }),
    });
    expect(result.source).toBe("deterministic");
    expect(result.note).toBeTruthy();
  });

  it("falls back on an HTTP error", async () => {
    const result = await buildLlmRequestAbstraction("코드 리뷰 해줘", config, {
      fetchImpl: fakeFetch(null, false, 500),
    });
    expect(result.source).toBe("deterministic");
    expect(result.abstract).toBe("사용자가 검토를 요청함");
  });

  it("falls back when fetch throws", async () => {
    const result = await buildLlmRequestAbstraction("이거 설명해줘", config, {
      fetchImpl: (async () => {
        throw new Error("boom");
      }) as unknown as typeof fetch,
    });
    expect(result.source).toBe("deterministic");
    expect(result.note).toBe("boom");
    expect(result.abstract).toBe("사용자가 설명을 요청함");
  });

  it("returns the deterministic empty result for blank input without calling the model", async () => {
    let called = false;
    const result = await buildLlmRequestAbstraction("   ", config, {
      fetchImpl: (async () => {
        called = true;
        throw new Error("should not be called");
      }) as unknown as typeof fetch,
    });
    expect(called).toBe(false);
    expect(result).toEqual({ summary: "", abstract: "", source: "deterministic" });
  });
});
