import { describe, expect, it } from "vitest";
import { isChatGptExport, parseChatGptExport } from "./parseChatGptExport";
import { normalizeAiTranscript } from "./normalizeAiTranscript";

/**
 * A trimmed but shape-accurate ChatGPT `conversations.json` entry: a single
 * conversation whose `mapping` is a parent→child chain of message nodes. The
 * root node carries no message; a hidden system node has empty parts.
 */
const SINGLE_CONVERSATION = JSON.stringify([
  {
    title: "Retry logic for the upload client",
    create_time: 1716700000,
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["sys"] },
      sys: {
        id: "sys",
        message: {
          author: { role: "system" },
          create_time: 1716700001,
          content: { content_type: "text", parts: [""] },
        },
        parent: "root",
        children: ["u1"],
      },
      u1: {
        id: "u1",
        message: {
          author: { role: "user" },
          create_time: 1716700002,
          content: { content_type: "text", parts: ["Add exponential backoff to uploadClient"] },
        },
        parent: "sys",
        children: ["a1"],
      },
      a1: {
        id: "a1",
        message: {
          author: { role: "assistant" },
          create_time: 1716700003,
          content: { content_type: "text", parts: ["Here is a retry wrapper:\n```ts\nawait retry()\n```"] },
        },
        parent: "u1",
        children: [],
      },
    },
  },
]);

describe("parseChatGptExport", () => {
  it("returns null for non-JSON and non-export text", () => {
    expect(parseChatGptExport("User: hi\nAssistant: hello")).toBeNull();
    expect(parseChatGptExport("not json at all")).toBeNull();
    expect(parseChatGptExport("{ broken json")).toBeNull();
    expect(parseChatGptExport(JSON.stringify({ unrelated: true }))).toBeNull();
  });

  it("parses a single-conversation export array into ordered, non-empty turns", () => {
    const result = parseChatGptExport(SINGLE_CONVERSATION);
    expect(result).not.toBeNull();
    expect(result?.conversationCount).toBe(1);
    expect(result?.conversationTitle).toBe("Retry logic for the upload client");
    // The empty system primer is dropped; user precedes assistant by create_time.
    expect(result?.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(result?.turns[0]?.content).toContain("exponential backoff");
    expect(result?.turns[1]?.content).toContain("```ts");
  });

  it("accepts a bare conversation object and a { conversations } wrapper", () => {
    const bare = JSON.parse(SINGLE_CONVERSATION)[0];
    expect(parseChatGptExport(JSON.stringify(bare))?.turns).toHaveLength(2);
    expect(parseChatGptExport(JSON.stringify({ conversations: [bare] }))?.turns).toHaveLength(2);
  });

  it("orders branched / out-of-order nodes by message create_time", () => {
    const outOfOrder = JSON.stringify({
      title: "Branched",
      mapping: {
        a: {
          message: { author: { role: "assistant" }, create_time: 20, content: { parts: ["second"] } },
        },
        u: {
          message: { author: { role: "user" }, create_time: 10, content: { parts: ["first"] } },
        },
      },
    });
    const turns = parseChatGptExport(outOfOrder)?.turns;
    expect(turns?.map((t) => t.content)).toEqual(["first", "second"]);
  });

  it("extracts text from multimodal { content_type, text } parts", () => {
    const multimodal = JSON.stringify({
      mapping: {
        u: {
          message: {
            author: { role: "user" },
            create_time: 1,
            content: { parts: [{ content_type: "text", text: "from object part" }] },
          },
        },
      },
    });
    expect(parseChatGptExport(multimodal)?.turns[0]?.content).toBe("from object part");
  });

  it("isChatGptExport mirrors parse success", () => {
    expect(isChatGptExport(SINGLE_CONVERSATION)).toBe(true);
    expect(isChatGptExport("User: hi")).toBe(false);
  });
});

describe("normalizeAiTranscript with ChatGPT export input", () => {
  it("normalizes pasted export JSON into a chatgptTranscript source with real turns", () => {
    const candidate = normalizeAiTranscript({
      projectId: "p1",
      sessionId: "s1",
      platform: "chatgpt",
      text: SINGLE_CONVERSATION,
      capturedAt: "2026-05-26T00:00:00Z",
    });
    expect(candidate.source.kind).toBe("chatgptTranscript");
    // The detail line reflects the two extracted turns (1 user, 1 assistant).
    expect(candidate.source.detail).toMatch(/2 turns/);
    expect(candidate.source.detail).toMatch(/1 user, 1 assistant/);
    // One event per turn: the ask heads the event, the reply is its summary —
    // and neither is raw JSON.
    expect(candidate.events[0]?.title).toContain("exponential backoff");
    expect(candidate.events[0]?.summary).toContain("retry wrapper");
    expect(candidate.events[0]?.summary).not.toContain("{");
  });

  it("still parses pasted plain-text ChatGPT transcripts (non-JSON) line-by-line", () => {
    const candidate = normalizeAiTranscript({
      projectId: "p1",
      sessionId: "s1",
      platform: "chatgpt",
      text: "User: hello\nChatGPT: hi there",
      capturedAt: "2026-05-26T00:00:00Z",
    });
    expect(candidate.source.kind).toBe("chatgptTranscript");
    // Paired into one event: ask in the title, reply in the summary.
    expect(candidate.events[0]?.title).toContain("hello");
    expect(candidate.events[0]?.summary).toContain("hi there");
  });
});
