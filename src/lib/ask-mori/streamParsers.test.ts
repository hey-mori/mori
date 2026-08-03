import { describe, expect, it } from "vitest";
import { OllamaStreamParser, OpenAiStreamParser } from "./streamParsers";

/**
 * Feed a whole wire payload one character at a time.
 *
 * The single property that matters for a stream parser is that the answer does
 * not depend on where the socket split the bytes. Per-character feeding is the
 * cruellest chunking there is, so anything that survives it survives the network.
 */
function pushOneCharAtATime(
  parser: { push(chunk: string): string; finish(): string },
  wire: string,
): string {
  let out = "";
  for (const char of wire) out += parser.push(char);
  return out + parser.finish();
}

function pushWhole(
  parser: { push(chunk: string): string; finish(): string },
  wire: string,
): string {
  return parser.push(wire) + parser.finish();
}

describe("OllamaStreamParser", () => {
  const wire = [
    '{"response":"요청 ","done":false}',
    '{"response":"흐름을 ","done":false}',
    '{"response":"제한","done":false}',
    '{"response":"","done":true,"total_duration":1484000000,"load_duration":796000000,' +
      '"prompt_eval_duration":20000000,"eval_duration":393000000,' +
      '"prompt_eval_count":31,"eval_count":23}',
  ].join("\n");

  it("accumulates the response text", () => {
    expect(pushWhole(new OllamaStreamParser(), wire)).toBe("요청 흐름을 제한");
  });

  it("gives the same answer however the bytes are split", () => {
    expect(pushOneCharAtATime(new OllamaStreamParser(), wire)).toBe("요청 흐름을 제한");
  });

  it("emits text as soon as a line completes, not at the end", () => {
    const parser = new OllamaStreamParser();
    // The point of streaming: the first token is visible before the last.
    expect(parser.push('{"response":"first","done":false}\n')).toBe("first");
  });

  it("holds a partial line until its newline arrives", () => {
    const parser = new OllamaStreamParser();
    expect(parser.push('{"response":"half')).toBe("");
    expect(parser.push('","done":false}\n')).toBe("half");
  });

  it("separates model load, prompt evaluation and generation", () => {
    // This split is the reason the timings are parsed at all: it tells a slow
    // model load apart from a long prompt apart from slow generation.
    const parser = new OllamaStreamParser();
    pushWhole(parser, wire);
    expect(parser.statistics).toEqual({
      loadMs: 796,
      promptEvalMs: 20,
      generationMs: 393,
      totalMs: 1484,
      promptTokens: 31,
      outputTokens: 23,
    });
    expect(parser.isDone).toBe(true);
  });

  it("reports no statistics before the final chunk", () => {
    const parser = new OllamaStreamParser();
    parser.push('{"response":"x","done":false}\n');
    expect(parser.statistics).toBeNull();
    expect(parser.isDone).toBe(false);
  });

  it("drops a malformed line instead of losing the whole generation", () => {
    const parser = new OllamaStreamParser();
    const text = pushWhole(
      parser,
      ['{"response":"a","done":false}', "not json at all", '{"response":"b","done":false}'].join(
        "\n",
      ),
    );
    expect(text).toBe("ab");
  });

  it("surfaces an error Ollama reports inside the stream", () => {
    // Ollama answers a missing model with HTTP 200 and an error field.
    const parser = new OllamaStreamParser();
    expect(() => parser.push('{"error":"model \'x\' not found"}\n')).toThrow(/not found/);
  });

  it("flushes a final object that has no trailing newline", () => {
    const parser = new OllamaStreamParser();
    parser.push('{"response":"tail","done":false}');
    expect(parser.finish()).toBe("tail");
  });

  it("returns nothing for an empty stream", () => {
    expect(pushWhole(new OllamaStreamParser(), "")).toBe("");
  });
});

describe("OpenAiStreamParser", () => {
  const wire = [
    'data: {"choices":[{"delta":{"content":"요청 "}}]}',
    "",
    'data: {"choices":[{"delta":{"content":"흐름"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  it("accumulates the delta content", () => {
    expect(pushWhole(new OpenAiStreamParser(), wire)).toBe("요청 흐름");
  });

  it("gives the same answer however the bytes are split", () => {
    expect(pushOneCharAtATime(new OpenAiStreamParser(), wire)).toBe("요청 흐름");
  });

  it("marks itself done at the sentinel", () => {
    const parser = new OpenAiStreamParser();
    pushWhole(parser, wire);
    expect(parser.isDone).toBe(true);
  });

  it("ignores keep-alive comment lines", () => {
    // A heartbeat is not data; treating it as one would inject junk.
    const parser = new OpenAiStreamParser();
    expect(parser.push(": keep-alive\n")).toBe("");
  });

  it("tolerates CRLF line endings", () => {
    const parser = new OpenAiStreamParser();
    expect(parser.push('data: {"choices":[{"delta":{"content":"x"}}]}\r\n')).toBe("x");
  });

  it("accepts a whole message when a proxy answers a stream in one frame", () => {
    const parser = new OpenAiStreamParser();
    expect(parser.push('data: {"choices":[{"message":{"content":"whole"}}]}\n')).toBe("whole");
  });

  it("skips a frame with no content rather than emitting undefined", () => {
    const parser = new OpenAiStreamParser();
    expect(parser.push('data: {"choices":[{"delta":{"role":"assistant"}}]}\n')).toBe("");
  });

  it("drops a malformed frame instead of losing the whole generation", () => {
    const parser = new OpenAiStreamParser();
    const text = pushWhole(
      parser,
      [
        'data: {"choices":[{"delta":{"content":"a"}}]}',
        "data: {oops",
        'data: {"choices":[{"delta":{"content":"b"}}]}',
      ].join("\n"),
    );
    expect(text).toBe("ab");
  });

  it("surfaces an error frame", () => {
    const parser = new OpenAiStreamParser();
    expect(() => parser.push('data: {"error":{"message":"context length"}}\n')).toThrow(
      /context length/,
    );
  });

  it("ignores a line that is not an SSE data field", () => {
    const parser = new OpenAiStreamParser();
    expect(parser.push("event: message\n")).toBe("");
  });
});
