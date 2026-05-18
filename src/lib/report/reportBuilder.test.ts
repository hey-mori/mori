import { describe, expect, it } from "vitest";
import {
  buildReportMarkdown,
  DEFAULT_SECTIONS,
  isReportGuidanceMemory,
  REPORT_TYPE_DEFINITIONS,
  toggleSection,
  type ReportPrivacyOptions,
  type ReportSectionId,
} from "./reportBuilder";
import { moriMockSession } from "../../domain/mock-data";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

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

  it("groups completed next actions under their own report sub-section", () => {
    const [first, ...rest] = moriMockSession.nextActions;
    const payload = buildReportMarkdown({
      view: {
        ...moriMockSession,
        nextActions: [
          { ...first!, done: true, completedAt: "2026-05-18T09:00:00Z" },
          ...rest,
        ],
      },
      type: "personalRetrospective",
      sections: new Set<ReportSectionId>(["nextActions"]),
      privacy: privacy(),
    });
    expect(payload.markdown).toContain("### 완료한 다음 작업");
    expect(payload.markdown).toContain(`**${first!.title}** _(완료)_`);
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

  it("renders the current user-edited issue and decision text", () => {
    const payload = buildReportMarkdown({
      view: {
        ...moriMockSession,
        issues: [
          {
            ...moriMockSession.issues[0]!,
            title: "Corrected issue title",
            description: "Corrected issue description",
            editedByUser: true,
            editedAt: "2026-05-18T12:00:00Z",
          },
        ],
        decisions: [
          {
            ...moriMockSession.decisions[0]!,
            title: "Corrected decision title",
            rationale: "Corrected decision rationale",
            editedByUser: true,
            editedAt: "2026-05-18T12:05:00Z",
          },
        ],
      },
      type: "personalRetrospective",
      sections: new Set<ReportSectionId>(["issues", "decisions"]),
      privacy: privacy(),
    });

    expect(payload.markdown).toContain("Corrected issue title");
    expect(payload.markdown).toContain("Corrected issue description");
    expect(payload.markdown).toContain("Corrected decision title");
    expect(payload.markdown).toContain("Corrected decision rationale");
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
        "consolidatedMemory",
        "timeline",
        "decisions",
        "issues",
        "evidence",
        "nextActions",
      ]),
    );
  });
});

// ─── accepted-memory report integration ───────────────────────────────

function acceptedMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: "mem-1",
    projectId: "p-1",
    kind: "promotedDecision",
    title: "Keep Import Review as a non-bypassable gate",
    summary: "Every captured event must pass through Import Review before a session.",
    status: "accepted",
    importance: "high",
    confidence: { label: "high", score: 0.9 },
    evidenceRefs: [{ kind: "session", sessionId: "s-cur", sessionTitle: "Current sprint" }],
    sourceSessionIds: ["s-cur", "s-old"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
    acceptedAt: "2026-05-12T10:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: ["act-1"],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

const WITH_MEMORY = new Set<ReportSectionId>(["consolidatedMemory"]);

describe("buildReportMarkdown — accepted memory section", () => {
  it("renders an Accepted Project Memory section for an eligible record", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: WITH_MEMORY,
      privacy: privacy(),
      acceptedMemories: [acceptedMemory()],
    });
    expect(payload.markdown).toContain("## Accepted Project Memory");
    expect(payload.markdown).toContain("Keep Import Review as a non-bypassable gate");
    expect(payload.markdown).toContain("Every captured event must pass through Import Review");
  });

  it("shows a placeholder when no accepted memories are passed", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: WITH_MEMORY,
      privacy: privacy(),
    });
    expect(payload.markdown).toContain("## Accepted Project Memory");
    expect(payload.markdown).toContain("검토된 프로젝트 메모리가 없습니다");
  });

  it("omits the section entirely when consolidatedMemory is not selected", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: new Set<ReportSectionId>(["summary"]),
      privacy: privacy(),
      acceptedMemories: [acceptedMemory()],
    });
    expect(payload.markdown).not.toContain("## Accepted Project Memory");
  });

  it("excludes a personal-tier memory from a team-tier report", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "teamUpdate",
      sections: WITH_MEMORY,
      privacy: privacy(),
      acceptedMemories: [acceptedMemory({ reportEligibility: "personal" })],
    });
    expect(payload.markdown).toContain("노출 가능한 검토된 메모리가 없습니다");
    expect(payload.markdown).not.toContain("Keep Import Review as a non-bypassable gate");
  });

  it("includes a team-tier memory in a team-tier report", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "teamUpdate",
      sections: WITH_MEMORY,
      privacy: privacy(),
      acceptedMemories: [acceptedMemory({ reportEligibility: "team" })],
    });
    expect(payload.markdown).toContain("Keep Import Review as a non-bypassable gate");
  });

  it("only admits clientSafe-tier memories into a client-safe report", () => {
    const teamMemory = acceptedMemory({ id: "m-team", reportEligibility: "team" });
    const clientMemory = acceptedMemory({
      id: "m-client",
      title: "Client-shareable decision",
      reportEligibility: "clientSafe",
    });
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "clientSafe",
      sections: WITH_MEMORY,
      privacy: privacy({ clientSafe: true }),
      acceptedMemories: [teamMemory, clientMemory],
    });
    expect(payload.markdown).toContain("Client-shareable decision");
    expect(payload.markdown).not.toContain("Keep Import Review as a non-bypassable gate");
  });

  it("drops the summary detail under client-safe privacy", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "clientSafe",
      sections: WITH_MEMORY,
      privacy: privacy({ clientSafe: true }),
      acceptedMemories: [acceptedMemory({ reportEligibility: "clientSafe" })],
    });
    expect(payload.markdown).toContain("Keep Import Review as a non-bypassable gate");
    expect(payload.markdown).not.toContain("Every captured event must pass through Import Review");
  });

  it("excludes stale / contradiction kinds and flags them for re-review", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: WITH_MEMORY,
      privacy: privacy(),
      acceptedMemories: [
        acceptedMemory({ id: "m-stale", kind: "staleMemory" }),
        acceptedMemory({ id: "m-conflict", kind: "contradiction" }),
      ],
    });
    expect(payload.markdown).toContain("노출 가능한 검토된 메모리가 없습니다");
    expect(payload.markdown).toMatch(/재검토 필요.*2건/);
  });

  it("excludes an explicitly excluded memory from every report", () => {
    const payload = buildReportMarkdown({
      view: moriMockSession,
      type: "personalRetrospective",
      sections: WITH_MEMORY,
      privacy: privacy(),
      acceptedMemories: [acceptedMemory({ reportEligibility: "excluded" })],
    });
    expect(payload.markdown).toContain("노출 가능한 검토된 메모리가 없습니다");
  });

  it("isReportGuidanceMemory enforces the audience-tier policy", () => {
    expect(isReportGuidanceMemory(acceptedMemory({ reportEligibility: "personal" }), "personalRetrospective")).toBe(true);
    expect(isReportGuidanceMemory(acceptedMemory({ reportEligibility: "personal" }), "teamUpdate")).toBe(false);
    expect(isReportGuidanceMemory(acceptedMemory({ reportEligibility: "team" }), "teamUpdate")).toBe(true);
    expect(isReportGuidanceMemory(acceptedMemory({ reportEligibility: "team" }), "clientSafe")).toBe(false);
    expect(isReportGuidanceMemory(acceptedMemory({ reportEligibility: "clientSafe" }), "clientSafe")).toBe(true);
    expect(isReportGuidanceMemory(acceptedMemory({ reportEligibility: "excluded" }), "personalRetrospective")).toBe(false);
    expect(isReportGuidanceMemory(acceptedMemory({ status: "watching" }), "personalRetrospective")).toBe(false);
    expect(isReportGuidanceMemory(acceptedMemory({ kind: "staleMemory" }), "personalRetrospective")).toBe(false);
  });
});
