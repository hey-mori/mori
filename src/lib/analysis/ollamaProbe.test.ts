import { describe, expect, it } from "vitest";
import { probeOllamaConnection } from "./ollamaProvider";

/** A fetch stub that returns `body` as JSON with the given status. */
function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("probeOllamaConnection", () => {
  it("parses model name, size, and parameter count from /api/tags", async () => {
    const result = await probeOllamaConnection({
      endpoint: "http://localhost:11434",
      fetchImpl: jsonFetch({
        models: [
          { name: "llama3.1:8b", size: 4_700_000_000, details: { parameter_size: "8.0B" } },
          { name: "qwen2.5:1.5b", size: 1_000_000_000, details: { parameter_size: "1.5B" } },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["llama3.1:8b", "qwen2.5:1.5b"]);
    expect(result.modelInfo).toEqual([
      { name: "llama3.1:8b", sizeBytes: 4_700_000_000, parameterSize: "8.0B" },
      { name: "qwen2.5:1.5b", sizeBytes: 1_000_000_000, parameterSize: "1.5B" },
    ]);
  });

  it("tolerates models missing size and details", async () => {
    const result = await probeOllamaConnection({
      endpoint: "http://localhost:11434",
      fetchImpl: jsonFetch({ models: [{ name: "custom-model" }] }),
    });
    expect(result.ok).toBe(true);
    expect(result.modelInfo).toHaveLength(1);
    expect(result.modelInfo?.[0].name).toBe("custom-model");
    expect(result.modelInfo?.[0].sizeBytes).toBeUndefined();
    expect(result.modelInfo?.[0].parameterSize).toBeUndefined();
  });

  it("skips entries without a name", async () => {
    const result = await probeOllamaConnection({
      endpoint: "http://localhost:11434",
      fetchImpl: jsonFetch({ models: [{ size: 10 }, { name: "ok-model" }] }),
    });
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["ok-model"]);
  });

  it("reports a non-OK HTTP status as not reachable", async () => {
    const result = await probeOllamaConnection({
      endpoint: "http://localhost:11434",
      fetchImpl: jsonFetch({}, 500),
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("500");
  });

  it("reports a fetch failure as not reachable", async () => {
    const result = await probeOllamaConnection({
      endpoint: "http://localhost:11434",
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });
});
