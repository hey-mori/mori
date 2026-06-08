import { describe, expect, it } from "vitest";
import { normalizeAiTranscript } from "./normalizeAiTranscript";
import type { NormalizeAiTranscriptInput } from "./types";

const mockBase = {
  projectId: "proj-test",
  sessionId: "sess-test",
  capturedAt: "2026-05-14T03:00:00.000Z",
};

describe("normalizeAiTranscript", () => {
  describe("Platform-specific integration IDs", () => {
    it("maps claude platform to claudeTranscript integration", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: Hello\nAssistant: Hi there!",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.kind).toBe("claudeTranscript");
      expect(result.source.title).toContain("Claude");
    });

    it("maps chatgpt platform to chatgptTranscript integration", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "chatgpt",
        text: "User: Hello\nAssistant: Hi there!",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.kind).toBe("chatgptTranscript");
      expect(result.source.title).toContain("ChatGPT");
    });

    it("maps codex platform to codexTranscript integration", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "codex",
        text: "User: Write a function\nAssistant: Here code",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.kind).toBe("codexTranscript");
      expect(result.source.title).toContain("Codex");
    });

    it("maps antigravity platform to antigravityTranscript integration", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "antigravity",
        text: "User: Plan the island\nAssistant: Here is the spec",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.kind).toBe("antigravityTranscript");
      expect(result.source.title).toContain("Antigravity");
    });

    it("maps opencode platform to opencodeTranscript integration", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "opencode",
        text: "User: Add retry\nAssistant: Done",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.kind).toBe("opencodeTranscript");
      expect(result.source.title).toContain("OpenCode");
    });

    it("maps continue platform to continueTranscript integration", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "continue",
        text: "User: Explain routing\nAssistant: Trie matcher",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.kind).toBe("continueTranscript");
      expect(result.source.title).toContain("Continue");
    });

    it("maps other platform to aiConversation integration", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "other",
        text: "User: Hello\nAI: Hi there!",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.kind).toBe("aiConversation");
      expect(result.source.title).toContain("AI");
    });
  });

  describe("Turn detection and parsing", () => {
    it("detects User and Assistant roles", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: What is TypeScript?\nAssistant: TypeScript is a typed superset of JavaScript.",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("2 turn");
      expect(result.source.detail).toContain("1 user, 1 assistant");
    });

    it("detects Human and AI roles", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "Human: Hello\nAI: Hi!",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("turn");
    });

    it("handles multiline turns", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: Can you help?\nI need assistance.\nAssistant: Sure!\nHappy to help.",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("2 turn");
    });

    it("detects code blocks in turns", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "chatgpt",
        text: "User: Write a function\nAssistant: Here you go:\n```typescript\nfunction test() {}\n```",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("code block");
    });
  });

  describe("Metadata generation", () => {
    it("generates source with correct trust level", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: Test",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.trustLevel).toBe("verified");
      expect(result.source.redactionStatus).toBe("notNeeded");
      expect(result.source.rawRetention).toBe("summaryOnly");
    });

    it("stamps capture fidelity onto the source", () => {
      const full = normalizeAiTranscript({
        ...mockBase,
        platform: "claude",
        text: "User: What is TypeScript?\nAssistant: A typed superset of JavaScript.",
      });
      expect(full.source.captureFidelity?.level).toBe("full");

      const partial = normalizeAiTranscript({
        ...mockBase,
        platform: "claude",
        text: "Assistant: ...as I was saying, that completes the change.",
      });
      expect(partial.source.captureFidelity?.level).toBe("partial");
    });

    it("uses custom title when provided", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        title: "React Hooks Discussion",
        text: "User: Explain hooks",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.title).toBe("React Hooks Discussion");
    });

    it("generates default title with platform name", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "chatgpt",
        text: "User: Hello",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.title).toBe("ChatGPT conversation");
    });

    it("estimates token count", () => {
      const longText = "User: " + "word ".repeat(100);
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: longText,
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toMatch(/~\d+ tokens/);
    });

    it("creates one event per Q&A turn (a single pair is one event)", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: Test\nAssistant: Response",
      };

      const result = normalizeAiTranscript(input);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe("aiConversation");
      expect(result.events[0].sourceRefs).toContain(result.source.id);
    });

    it("splits a multi-turn transcript into one event per turn", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text:
          "User: First ask\nAssistant: First reply\n" +
          "User: Second ask\nAssistant: Second reply\n" +
          "User: Third ask\nAssistant: Third reply",
      };

      const result = normalizeAiTranscript(input);

      // Three Q&A pairs become three timeline events, not one blob.
      expect(result.events).toHaveLength(3);
      expect(result.events[0].title).toContain("First ask");
      expect(result.events[0].summary).toContain("First reply");
      expect(result.events[2].title).toContain("Third ask");
      // Every event is back-referenced by the source and turn-ordered.
      expect(result.source.relatedEventIds).toHaveLength(3);
      expect(result.events.map((e) => e.turnIndex)).toEqual([0, 1, 2]);
      // Event ids are distinct so dedupe / selection never collide.
      expect(new Set(result.events.map((e) => e.id)).size).toBe(3);
    });
  });

  describe("Summary generation", () => {
    it("uses first user message for summary", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: How do I use TypeScript?\nAssistant: TypeScript is great!",
      };

      const result = normalizeAiTranscript(input);

      // The ask heads the event (title); the reply is the summary.
      expect(result.events[0].title).toContain("How do I use TypeScript?");
      expect(result.events[0].summary).toContain("TypeScript is great!");
    });

    it("truncates long summaries to 160 characters", () => {
      const longMessage = "User: " + "word ".repeat(50);
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: longMessage,
      };

      const result = normalizeAiTranscript(input);

      expect(result.events[0].summary.length).toBeLessThanOrEqual(160);
      expect(result.events[0].summary).toMatch(/\.\.\.$/);
    });

    it("handles transcript with no role markers", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "other",
        text: "Just some plain conversation text without role markers.",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("turn");
      expect(result.events[0].summary).toBeTruthy();
    });
  });

  describe("Edge cases", () => {
    it("handles empty lines in transcript", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: Hello\n\n\nAssistant: Hi",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("turn");
    });

    it("handles transcript with only user messages", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "User: Question one\nUser: Question two",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("2 turn");
    });

    it("handles transcript with System messages", () => {
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        platform: "claude",
        text: "System: You are a helpful assistant\nUser: Hello\nAssistant: Hi",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.detail).toContain("3 turn");
    });

    it("preserves captured timestamp", () => {
      const customTime = "2026-01-01T00:00:00.000Z";
      const input: NormalizeAiTranscriptInput = {
        ...mockBase,
        capturedAt: customTime,
        platform: "claude",
        text: "User: Test",
      };

      const result = normalizeAiTranscript(input);

      expect(result.source.capturedAt).toBe(customTime);
      expect(result.events[0].start).toBe(customTime);
    });
  });
});
