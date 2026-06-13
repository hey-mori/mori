import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import { buildResumePrompt } from "./resume-prompt";

describe("resume prompt", () => {
  it("grounds the prompt in this session's own project, title, decisions, issues, and next actions", () => {
    const prompt = buildResumePrompt(mockSession);

    // Grounded in the session itself, not a hardcoded Mori-app description.
    expect(prompt).toContain(mockSession.session.title);
    expect(prompt).toContain(mockSession.project.name);
    expect(prompt).toContain("최근 결정");
    expect(prompt).toContain("미해결 이슈");
    expect(prompt).toContain("다음 액션");
    expect(prompt).toContain(mockSession.decisions[0]!.title);
  });

  it("does not hardcode the Mori app description for non-Mori sessions", () => {
    const jwtSession = {
      ...mockSession,
      project: { ...mockSession.project, name: "ng-gw" },
      session: { ...mockSession.session, title: "JWT 인증 미들웨어 도입" },
    };
    const prompt = buildResumePrompt(jwtSession);

    expect(prompt).toContain("JWT 인증 미들웨어 도입");
    expect(prompt).toContain("ng-gw");
    expect(prompt).not.toContain("Mori remembers how the work happened");
    expect(prompt).not.toContain("local-first AI work memory app");
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
