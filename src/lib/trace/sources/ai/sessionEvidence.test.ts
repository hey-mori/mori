import { describe, expect, it } from "vitest";
import { activityClassOf, claudeInteraction, codexInteraction } from "./sessionEvidence";

describe("interaction from the source's own marker", () => {
  it("reads Claude's entrypoint without guessing unknown values", () => {
    expect(claudeInteraction("cli")).toBe("interactive");
    expect(claudeInteraction("sdk-cli")).toBe("automation");
    expect(claudeInteraction("sdk-ts")).toBe("automation");
    expect(claudeInteraction("")).toBe("unknown");
    expect(claudeInteraction(undefined)).toBe("unknown");
    expect(claudeInteraction("some-new-surface")).toBe("unknown");
  });

  it("reads Codex's session source", () => {
    expect(codexInteraction("exec")).toBe("automation");
    expect(codexInteraction("cli")).toBe("interactive");
    expect(codexInteraction("vscode")).toBe("interactive");
    expect(codexInteraction("")).toBe("unknown");
    expect(codexInteraction("mcp")).toBe("unknown");
  });

  it("accepts only the classes the readers define", () => {
    expect(activityClassOf("command-only")).toBe("command-only");
    expect(activityClassOf("empty")).toBe("empty");
    expect(activityClassOf("bogus")).toBeUndefined();
    expect(activityClassOf(undefined)).toBeUndefined();
  });
});
