import { describe, expect, it } from "vitest";
import {
  assessGitDiffFidelity,
  assessTranscriptFidelity,
  assessUrlFidelity,
  GIT_DIFF_FIDELITY_REASON,
  TRANSCRIPT_FIDELITY_REASON,
  URL_FIDELITY_REASON,
} from "./captureFidelity";

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

describe("assessGitDiffFidelity", () => {
  const completeDiff = [
    "diff --git a/src/foo.ts b/src/foo.ts",
    "index 1234567..89abcde 100644",
    "--- a/src/foo.ts",
    "+++ b/src/foo.ts",
    "@@ -1,3 +1,4 @@",
    " const a = 1;",
    "-const b = 2;",
    "+const b = 3;",
    "+const c = 4;",
    " const d = 5;",
  ].join("\n");

  it("reports a complete diff (final hunk matches its header) as full", () => {
    const result = assessGitDiffFidelity(completeDiff);

    expect(result.level).toBe("full");
    expect(result.reasons).toEqual([]);
  });

  it("flags a diff cut off mid-hunk as partial", () => {
    const truncated = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,6 +1,7 @@",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 3;",
    ].join("\n");

    const result = assessGitDiffFidelity(truncated);

    expect(result.level).toBe("partial");
    expect(result.reasons).toContain(GIT_DIFF_FIDELITY_REASON.truncatedHunk);
  });

  it("treats a header-only diff with no hunks (rename/mode change) as full", () => {
    const renameOnly = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 100%",
      "rename from old.ts",
      "rename to new.ts",
    ].join("\n");

    expect(assessGitDiffFidelity(renameOnly).level).toBe("full");
  });

  it("does not flag a complete diff whose blank context lines lost their leading space", () => {
    const strippedBlanks = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "@@ -1,3 +1,3 @@",
      " const a = 1;",
      "",
      "-const b = 2;",
      "+const b = 3;",
    ].join("\n");

    expect(assessGitDiffFidelity(strippedBlanks).level).toBe("full");
  });
});

describe("assessUrlFidelity", () => {
  it("reports a bare URL as a full reference", () => {
    const result = assessUrlFidelity();

    expect(result.level).toBe("full");
    expect(result.reasons).toEqual([]);
  });

  it("reports a URL with a selected excerpt as partial (excerpt only)", () => {
    const result = assessUrlFidelity("the part of the page I copied");

    expect(result.level).toBe("partial");
    expect(result.reasons).toContain(URL_FIDELITY_REASON.excerptOnly);
  });

  it("treats whitespace-only excerpt as a bare URL", () => {
    expect(assessUrlFidelity("   ").level).toBe("full");
  });
});
