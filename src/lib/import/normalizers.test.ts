import { describe, expect, it } from "vitest";
import { normalizeAiConversationText, normalizeManualNote, normalizeUrlSource } from "./index";

const base = {
  projectId: "proj-test",
  sessionId: "sess-test",
  capturedAt: "2026-05-12T13:00:00+09:00",
};

describe("source import normalizers", () => {
  it("normalizes a manual note into a verified note source and event", () => {
    const result = normalizeManualNote({
      ...base,
      title: "Positioning note",
      note: "Mori is work-flow reconstruction, not searchable memory.",
    });

    expect(result.source.kind).toBe("manualNote");
    expect(result.source.trustLevel).toBe("verified");
    expect(result.events[0]?.type).toBe("documentNote");
    expect(result.events[0]?.sourceRefs).toContain(result.source.id);
  });

  it("normalizes a URL into a browser research event", () => {
    const result = normalizeUrlSource({
      ...base,
      title: "screenpipe",
      url: "https://github.com/mediar-ai/screenpipe",
    });

    expect(result.source.kind).toBe("browser");
    expect(result.source.uri).toContain("screenpipe");
    expect(result.events[0]?.type).toBe("webResearch");
  });

  it("normalizes AI conversation text into an import event", () => {
    const result = normalizeAiConversationText({
      ...base,
      provider: "Claude",
      text: "User: What is Mori?\n\nAssistant: Mori remembers how the work happened.",
    });

    expect(result.source.kind).toBe("aiConversation");
    expect(result.source.detail).toContain("2 message-like blocks");
    expect(result.events[0]?.type).toBe("aiConversation");
  });
});
