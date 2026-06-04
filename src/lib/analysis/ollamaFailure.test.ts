import { describe, expect, it } from "vitest";
import { describeOllamaFailure } from "./ollamaProvider";

describe("describeOllamaFailure", () => {
  it("surfaces the Ollama error body and adds a hint for memory failures", () => {
    const message = describeOllamaFailure(500, '{"error":"memory layout cannot be allocated"}');
    expect(message).toContain("memory layout cannot be allocated");
    expect(message).toContain("더 작은 모델");
  });

  it("surfaces a non-memory error without the size hint", () => {
    const message = describeOllamaFailure(404, '{"error":"model \\"x\\" not found"}');
    expect(message).toContain("not found");
    expect(message).not.toContain("더 작은 모델");
  });

  it("falls back to the status code when there is no body", () => {
    expect(describeOllamaFailure(500, "")).toContain("HTTP 500");
  });
});
