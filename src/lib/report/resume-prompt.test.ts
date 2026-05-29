import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import { buildResumePrompt } from "./resume-prompt";

describe("resume prompt", () => {
  it("includes Mori identity, decisions, issues, files, and next actions", () => {
    const prompt = buildResumePrompt(mockSession);

    expect(prompt).toContain("Mori remembers how the work happened");
    expect(prompt).toContain("Last decisions");
    expect(prompt).toContain("Open issues");
    expect(prompt).toContain("Files touched");
    expect(prompt).toContain("Next actions");
    expect(prompt).toContain(".mori");
  });

  it("excludes completed next actions from the resume prompt", () => {
    const [first, ...rest] = mockSession.nextActions;
    const prompt = buildResumePrompt({
      ...mockSession,
      nextActions: [
        { ...first!, done: true, completedAt: "2026-05-18T09:00:00Z" },
        ...rest,
      ],
    });

    expect(prompt).not.toContain(`- ${first!.title}`);
    for (const action of rest) {
      expect(prompt).toContain(`- ${action.title}`);
    }
  });
});
