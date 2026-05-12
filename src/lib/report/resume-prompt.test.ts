import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { buildResumePrompt } from "./resume-prompt";

describe("resume prompt", () => {
  it("includes Mori identity, decisions, issues, files, and next actions", () => {
    const prompt = buildResumePrompt(moriMockSession);

    expect(prompt).toContain("Mori remembers how the work happened");
    expect(prompt).toContain("Last decisions");
    expect(prompt).toContain("Open issues");
    expect(prompt).toContain("Files touched");
    expect(prompt).toContain("Next actions");
    expect(prompt).toContain(".mori");
  });
});
