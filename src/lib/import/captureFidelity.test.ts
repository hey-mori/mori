import { describe, expect, it } from "vitest";
import { assessTranscriptFidelity, TRANSCRIPT_FIDELITY_REASON } from "./captureFidelity";

describe("assessTranscriptFidelity", () => {
  it("reports a clean user/assistant exchange as full with no reasons", () => {
    const result = assessTranscriptFidelity("User: How do I use TypeScript?\nAssistant: It is a typed superset.");

    expect(result.level).toBe("full");
    expect(result.reasons).toEqual([]);
  });

  it("treats a System + User + Assistant transcript as full (system start is natural)", () => {
    const result = assessTranscriptFidelity(
      "System: You are helpful\nUser: Hi\nAssistant: Hello",
    );

    expect(result.level).toBe("full");
    expect(result.reasons).toEqual([]);
  });

  it("reports empty input as unknown", () => {
    const result = assessTranscriptFidelity("   \n  ");

    expect(result.level).toBe("unknown");
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.empty);
  });

  it("reports a paste with no role markers as unknown (cannot assess structure)", () => {
    const result = assessTranscriptFidelity("Just some text I copied without any role labels at all.");

    expect(result.level).toBe("unknown");
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.noRoleMarkers);
  });

  it("flags a transcript that begins on an assistant reply as partial", () => {
    const result = assessTranscriptFidelity(
      "Assistant: Here is the rest of my answer.\nUser: Thanks, and one more thing?",
    );

    expect(result.level).toBe("partial");
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.startsMidConversation);
  });

  it("flags an explicit truncation marker as partial", () => {
    const result = assessTranscriptFidelity(
      "User: Summarise this\nAssistant: Sure, here it is\n[truncated]",
    );

    expect(result.level).toBe("partial");
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.truncationMarker);
  });

  it("flags assistant-only captures as partial", () => {
    const result = assessTranscriptFidelity("Assistant: First point.\nAssistant: Second point.");

    expect(result.level).toBe("partial");
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.assistantOnly);
  });

  it("flags user-only captures as partial (responses not captured)", () => {
    const result = assessTranscriptFidelity("User: Question one\nUser: Question two");

    expect(result.level).toBe("partial");
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.noAssistantResponses);
  });

  it("reports a fragment when both ends are missing (mid-start + truncated)", () => {
    const result = assessTranscriptFidelity(
      "Assistant: ...continuing the previous thought, so the next step is\n[truncated]",
    );

    expect(result.level).toBe("fragment");
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.startsMidConversation);
    expect(result.reasons).toContain(TRANSCRIPT_FIDELITY_REASON.truncationMarker);
  });

  it("does not flag ordinary prose that merely uses the word truncated", () => {
    const result = assessTranscriptFidelity(
      "User: I truncated the array before sending it.\nAssistant: Good, that avoids the overflow.",
    );

    expect(result.level).toBe("full");
    expect(result.reasons).not.toContain(TRANSCRIPT_FIDELITY_REASON.truncationMarker);
  });
});
