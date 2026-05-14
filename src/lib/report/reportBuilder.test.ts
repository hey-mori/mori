import { describe, expect, it } from "vitest";
import {
  buildReportMarkdown,
  DEFAULT_SECTIONS,
  REPORT_TYPE_DEFINITIONS,
  toggleSection,
  type ReportPrivacyOptions,
  type ReportSectionId,
} from "./reportBuilder";
import { moriMockSession } from "../../domain/mock-data";

function privacy(overrides: Partial<ReportPrivacyOptions> = {}): ReportPrivacyOptions {
  return { clientSafe: false, excludeRawTranscripts: false, excludeSourceDetails: false, ...overrides };
}

describe("buildReportMarkdown", () => {
  it("always emits a header with the session title and report type", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: DEFAULT_SECTIONS,
      privacy: privacy(),
    });
    expect(payload.markdown).toMatch(/^# .+ · Personal Retrospective/);
  });

  it("includes the data basis line and per-section counts in the header", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: DEFAULT_SECTIONS,
      privacy: privacy(),
    });
    expect(payload.markdown).toContain("Data basis:");
    expect(payload.counts.events).toBe(moriMockSession.events.length);
    expect(payload.counts.issues).toBe(moriMockSession.issues.length);
    expect(payload.counts.decisions).toBe(moriMockSession.decisions.length);
    expect(payload.counts.nextActions).toBe(moriMockSession.nextActions.length);
    expect(payload.counts.sources).toBe(moriMockSession.sources.length);
  });

  it("only renders sections present in the sections set", () => {
    const onlySummary = new Set<ReportSectionId>(["summary"]);
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: onlySummary,
      privacy: privacy(),
    });
    expect(payload.markdown).toContain("## Summary");
    expect(payload.markdown).not.toContain("## Timeline");
    expect(payload.markdown).not.toContain("## Decisions");
    expect(payload.markdown).not.toContain("## Issues");
    expect(payload.markdown).not.toContain("## Evidence");
    expect(payload.markdown).not.toContain("## Next Actions");
  });

  it("excludes the resume prompt section when the report type is client-safe", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "clientSafe",
      sections: DEFAULT_SECTIONS,
      privacy: privacy({ clientSafe: true }),
      resumePromptOverride: "secret resume prompt",
    });
    // The dedicated section header should not appear, and the override text
    // should never reach a client-facing report — but unrelated content in
    // the session (e.g. an issue titled "Resume Prompt 품질 개선") may still
    // legitimately mention the phrase, which is fine.
    expect(payload.markdown).not.toContain("## Resume Prompt");
    expect(payload.markdown).not.toContain("secret resume prompt");
  });

  it("renders the resume prompt when override provided and not client-safe", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: DEFAULT_SECTIONS,
      privacy: privacy(),
      resumePromptOverride: "Pick up from the Reports milestone.",
    });
    expect(payload.markdown).toContain("## Resume Prompt");
    expect(payload.markdown).toContain("Pick up from the Reports milestone.");
  });

  it("client-safe mode strips event summaries, decision rationale, issue bodies, and source titles", () => {
    const safe = buildReportMarkdown({
      view: moriMockSession,
      type: "clientSafe",
      sections: DEFAULT_SECTIONS,
      privacy: privacy({ clientSafe: true }),
    });
    const firstEventSummary = moriMockSession.events[0].summary;
    const firstDecisionRationale = moriMockSession.decisions[0].rationale;
    const firstIssueDescription = moriMockSession.issues[0].description;
    expect(safe.markdown).toContain("Privacy: Client-safe");
    expect(safe.markdown).not.toContain(firstEventSummary);
    expect(safe.markdown).not.toContain(firstDecisionRationale);
    expect(safe.markdown).not.toContain(firstIssueDescription);
  });

  it("excludeSourceDetails hides the source list while keeping evidence counts", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: new Set<ReportSectionId>(["evidence"]),
      privacy: privacy({ excludeSourceDetails: true }),
    });
    expect(payload.markdown).toContain("## Evidence");
    expect(payload.markdown).toContain("총 소스");
    expect(payload.markdown).not.toContain("**소스 목록**");
  });

  it("emits a warning when the session has zero sources", () => {
    const view = {
      ...moriMockSession,
      sources: [],
      events: [],
      issues: [],
      decisions: [],
      nextActions: [],
    };
    const payload = buildReportMarkdown({
      view,
      type: "personalRetrospective",
      sections: DEFAULT_SECTIONS,
      privacy: privacy(),
    });
    expect(payload.warnings.some((line) => /가져온 소스가 없습니다/.test(line))).toBe(true);
    expect(payload.markdown).toContain("Notes:");
  });

  it("collapses excessive blank lines and ends with a single trailing newline", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: DEFAULT_SECTIONS,
      privacy: privacy(),
    });
    expect(payload.markdown.endsWith("\n")).toBe(true);
    expect(payload.markdown.endsWith("\n\n")).toBe(false);
    expect(/\n\n\n/.test(payload.markdown)).toBe(false);
  });
});

describe("toggleSection", () => {
  it("adds a section that was not previously included", () => {
    const next = toggleSection(new Set(["summary"]), "timeline");
    expect(next.has("summary")).toBe(true);
    expect(next.has("timeline")).toBe(true);
  });

  it("removes a section that was already included", () => {
    const next = toggleSection(new Set(["summary", "timeline"]), "summary");
    expect(next.has("summary")).toBe(false);
    expect(next.has("timeline")).toBe(true);
  });

  it("never mutates the input set", () => {
    const original = new Set<ReportSectionId>(["summary"]);
    const next = toggleSection(original, "timeline");
    expect(original.has("timeline")).toBe(false);
    expect(next).not.toBe(original);
  });
});

describe("REPORT_TYPE_DEFINITIONS", () => {
  it("has Korean labels, audience, and default sections for every report type", () => {
    for (const def of REPORT_TYPE_DEFINITIONS) {
      expect(def.id).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.audience).toBeTruthy();
      expect(def.defaultSections.length).toBeGreaterThan(0);
    }
  });

  it("client-safe report defaults to client-safe privacy", () => {
    const clientSafe = REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === "clientSafe")!;
    expect(clientSafe.defaultPrivacy.clientSafe).toBe(true);
    expect(clientSafe.defaultPrivacy.excludeRawTranscripts).toBe(true);
    expect(clientSafe.defaultPrivacy.excludeSourceDetails).toBe(true);
  });

  it("personal retrospective defaults to all sections", () => {
    const personal = REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === "personalRetrospective")!;
    expect(new Set(personal.defaultSections)).toEqual(
      new Set<ReportSectionId>([
        "summary",
        "timeline",
        "decisions",
        "issues",
        "evidence",
        "nextActions",
      ]),
    );
  });
});
