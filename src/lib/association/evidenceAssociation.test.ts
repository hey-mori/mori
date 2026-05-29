import { describe, expect, it } from "vitest";
import {
  buildEvidenceAssociationProposals,
  type AssociationCandidate,
  type AssociationSpine,
} from "./evidenceAssociation";

const spine: AssociationSpine = {
  id: "spine-1",
  projectPath: "C:/dev/mori",
  windowStart: "2026-05-29T09:00:00.000Z",
  windowEnd: "2026-05-29T10:00:00.000Z",
  connectorId: "claudeCodeHook",
  externalSessionId: "sess-abc",
};

function candidate(overrides: Partial<AssociationCandidate>): AssociationCandidate {
  return { id: "cand", kind: "gitDiff", ...overrides };
}

describe("buildEvidenceAssociationProposals", () => {
  it("proposes nothing when no signal matches", () => {
    const result = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "unrelated",
        projectPath: "C:/other/project",
        occurredAt: "2026-04-01T00:00:00.000Z",
      }),
    ]);
    expect(result).toEqual([]);
  });

  it("treats a connector session match as high confidence on its own", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "same-session",
        kind: "connectorJsonl",
        connectorId: "claudeCodeHook",
        externalSessionId: "sess-abc",
        // No project, far-off time, the identity match alone should win.
        projectPath: "C:/somewhere/else",
        occurredAt: "2025-01-01T00:00:00.000Z",
      }),
    ]);
    expect(proposal.confidence).toBe("high");
    expect(proposal.signals).toContain("connectorSession");
    expect(proposal.signals[0]).toBe("connectorSession");
  });

  it("scores same project plus time-window overlap as high", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "git-in-window",
        projectPath: "C:/dev/mori",
        occurredAt: "2026-05-29T09:30:00.000Z",
      }),
    ]);
    expect(proposal.confidence).toBe("high");
    expect(proposal.signals).toEqual(["projectPath", "timeWindow"]);
  });

  it("treats a shared parent directory as a project match", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "sibling-dir",
        projectPath: "C:/dev/mori/src-tauri",
        occurredAt: "2026-05-29T09:30:00.000Z",
      }),
    ]);
    expect(proposal.confidence).toBe("high");
    expect(proposal.signals).toContain("sharedDirectory");
  });

  it("scores same project plus near-but-outside time as medium", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "git-just-after",
        projectPath: "C:/dev/mori",
        // 15 minutes after the window end, within the 30-minute tolerance.
        occurredAt: "2026-05-29T10:15:00.000Z",
      }),
    ]);
    expect(proposal.confidence).toBe("medium");
    expect(proposal.signals).toEqual(["projectPath", "timeProximity"]);
  });

  it("scores project-only (no usable time) as low", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({ id: "note-no-time", kind: "manualNote", projectPath: "C:/dev/mori" }),
    ]);
    expect(proposal.confidence).toBe("low");
    expect(proposal.signals).toEqual(["projectPath"]);
  });

  it("scores time-window-only (no project) as low", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({ id: "terminal-in-window", kind: "terminal", occurredAt: "2026-05-29T09:30:00.000Z" }),
    ]);
    expect(proposal.confidence).toBe("low");
    expect(proposal.signals).toEqual(["timeWindow"]);
  });

  it("excludes time-proximity-only as too weak", () => {
    const result = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "near-only",
        // Near in time, but no project and no connector match.
        occurredAt: "2026-05-29T10:20:00.000Z",
      }),
    ]);
    expect(result).toEqual([]);
  });

  it("uses the event span when present for the time signal", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "span-overlaps",
        projectPath: "C:/dev/mori",
        spanStart: "2026-05-29T08:30:00.000Z",
        spanEnd: "2026-05-29T09:15:00.000Z",
      }),
    ]);
    expect(proposal.signals).toContain("timeWindow");
    expect(proposal.confidence).toBe("high");
  });

  it("normalizes path separators, trailing slashes, and case", () => {
    const [proposal] = buildEvidenceAssociationProposals(spine, [
      candidate({
        id: "messy-path",
        projectPath: "c:\\dev\\mori\\",
        occurredAt: "2026-05-29T09:30:00.000Z",
      }),
    ]);
    expect(proposal.signals).toContain("projectPath");
  });

  it("sorts strongest confidence first, then by candidate id", () => {
    const result = buildEvidenceAssociationProposals(spine, [
      candidate({ id: "low-b", kind: "manualNote", projectPath: "C:/dev/mori" }),
      candidate({
        id: "high-z",
        projectPath: "C:/dev/mori",
        occurredAt: "2026-05-29T09:30:00.000Z",
      }),
      candidate({ id: "low-a", kind: "manualNote", projectPath: "C:/dev/mori" }),
    ]);
    expect(result.map((p) => p.candidateId)).toEqual(["high-z", "low-a", "low-b"]);
  });

  it("ignores spine connector identity when only one side has it", () => {
    const noConnectorSpine: AssociationSpine = {
      id: "spine-2",
      projectPath: "C:/dev/mori",
      windowStart: "2026-05-29T09:00:00.000Z",
      windowEnd: "2026-05-29T10:00:00.000Z",
    };
    const [proposal] = buildEvidenceAssociationProposals(noConnectorSpine, [
      candidate({
        id: "has-connector",
        kind: "connectorJsonl",
        connectorId: "claudeCodeHook",
        externalSessionId: "sess-abc",
        projectPath: "C:/dev/mori",
        occurredAt: "2026-05-29T09:30:00.000Z",
      }),
    ]);
    expect(proposal.signals).not.toContain("connectorSession");
    expect(proposal.confidence).toBe("high"); // still high via project + window
  });

  it("returns empty and does not throw on an unparseable spine window", () => {
    const badSpine: AssociationSpine = {
      id: "spine-bad",
      projectPath: "C:/dev/mori",
      windowStart: "not-a-date",
      windowEnd: "also-bad",
    };
    const [proposal] = buildEvidenceAssociationProposals(badSpine, [
      candidate({ id: "p", projectPath: "C:/dev/mori", occurredAt: "2026-05-29T09:30:00.000Z" }),
    ]);
    // Project still matches; time signal is simply absent.
    expect(proposal.confidence).toBe("low");
    expect(proposal.signals).toEqual(["projectPath"]);
  });
});
