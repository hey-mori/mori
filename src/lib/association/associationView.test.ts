import { describe, expect, it } from "vitest";
import type { ConnectorEvent } from "../connectors/types";
import { buildEvidenceAssociationView } from "./associationView";
import type { AssociationCandidate, AssociationSpine } from "./evidenceAssociation";

const spine: AssociationSpine = {
  id: "spine-1",
  projectPath: "C:/dev/mori",
  windowStart: "2026-05-29T09:00:00.000Z",
  windowEnd: "2026-05-29T10:00:00.000Z",
  connectorId: "claudeCodeHook",
  externalSessionId: "claude-sess-abc",
};

function connectorEvent(overrides: Partial<ConnectorEvent>): ConnectorEvent {
  return {
    id: "evt",
    connectorId: "git",
    kind: "git_diff_captured",
    occurredAt: "2026-05-29T09:30:00.000Z",
    summary: "diff",
    projectPath: "C:/dev/mori",
    privacy: { captureMethod: "local_hook", rawDataPolicy: "summary_only" },
    provenance: { toolName: "test" },
    ...overrides,
  };
}

describe("buildEvidenceAssociationView", () => {
  it("excludes the spine's own connector conversation from its ribs", () => {
    const view = buildEvidenceAssociationView({
      spine,
      connectorEvents: [
        // The spine's own conversation events (same connector + session).
        connectorEvent({
          id: "own",
          connectorId: "claudeCodeHook",
          sessionId: "claude-sess-abc",
        }),
        // A real rib: a git run in the same project and window.
        connectorEvent({ id: "g", connectorId: "git", sessionId: "git-1" }),
      ],
    });
    expect(view.proposals.map((p) => p.candidateId)).toEqual(["git::git-1"]);
    expect(view.total).toBe(1);
  });

  it("tallies proposals by confidence", () => {
    const view = buildEvidenceAssociationView({
      spine,
      connectorEvents: [
        // high: project + window
        connectorEvent({ id: "h", connectorId: "git", sessionId: "g1" }),
        // low: project only, no usable time
        {
          ...connectorEvent({ id: "l", connectorId: "terminal", sessionId: "t1" }),
          occurredAt: "not-a-date",
        },
      ],
    });
    expect(view.highCount).toBe(1);
    expect(view.lowCount).toBe(1);
    expect(view.mediumCount).toBe(0);
    expect(view.total).toBe(2);
  });

  it("merges caller-supplied candidates and dedupes by id", () => {
    const extra: AssociationCandidate = {
      id: "git::git-1", // same id as the connector-derived candidate below
      kind: "gitDiff",
      projectPath: "C:/dev/mori",
      occurredAt: "2026-05-29T09:30:00.000Z",
    };
    const view = buildEvidenceAssociationView({
      spine,
      connectorEvents: [connectorEvent({ id: "g", connectorId: "git", sessionId: "git-1" })],
      candidates: [extra],
    });
    // The duplicate id appears once, not twice.
    expect(view.proposals.filter((p) => p.candidateId === "git::git-1")).toHaveLength(1);
  });

  it("returns an empty view when nothing matches", () => {
    const view = buildEvidenceAssociationView({
      spine,
      connectorEvents: [
        connectorEvent({
          id: "far",
          connectorId: "git",
          sessionId: "x",
          projectPath: "C:/other",
          occurredAt: "2020-01-01T00:00:00.000Z",
        }),
      ],
    });
    expect(view).toEqual({
      spineId: "spine-1",
      proposals: [],
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      total: 0,
    });
  });
});
