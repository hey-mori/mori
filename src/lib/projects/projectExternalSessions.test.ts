import { describe, expect, it } from "vitest";
import type { ConnectedProject } from "./projectConnection";
import {
  buildProjectExternalSessions,
  externalSessionToConnectionSource,
  type ExternalAgentSessionLink,
} from "./projectExternalSessions";

function session(partial: Partial<ExternalAgentSessionLink>): ExternalAgentSessionLink {
  return {
    id: partial.id ?? "s",
    projectPath: partial.projectPath,
    agentName: partial.agentName,
    title: partial.title,
    updatedAt: partial.updatedAt,
  };
}

function connection(partial: Partial<ConnectedProject>): ConnectedProject {
  return {
    projectKey: partial.projectKey ?? "/Users/x/dev/mori",
    aliases: partial.aliases ?? [],
    createdAt: partial.createdAt ?? "2026-06-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-06-01T00:00:00.000Z",
  };
}

describe("externalSessionToConnectionSource", () => {
  it("maps projectPath to label and preserves id / title", () => {
    expect(
      externalSessionToConnectionSource(
        session({ id: "a", projectPath: "/dev/mori", title: "리팩터링" }),
      ),
    ).toEqual({ id: "a", label: "/dev/mori", title: "리팩터링" });
  });
});

describe("buildProjectExternalSessions", () => {
  it("treats exact and confirmed-alias paths as connected, newest first", () => {
    const result = buildProjectExternalSessions({
      projectKey: "/Users/x/dev/mori",
      sessions: [
        session({ id: "exact", projectPath: "/users/x/dev/mori/", updatedAt: "2026-06-01T10:00:00Z" }),
        session({ id: "alias", projectPath: "mori", updatedAt: "2026-06-02T10:00:00Z" }),
        session({ id: "other", projectPath: "/play/mori", updatedAt: "2026-06-03T10:00:00Z" }),
      ],
      connections: [connection({ projectKey: "/Users/x/dev/mori", aliases: ["mori"] })],
    });
    expect(result.connected.map((s) => s.id)).toEqual(["alias", "exact"]);
    // "other" only shares the basename and is not confirmed → not connected.
    expect(result.connected.some((s) => s.id === "other")).toBe(false);
  });

  it("surfaces unconfirmed basename near-matches as candidates", () => {
    const result = buildProjectExternalSessions({
      projectKey: "/Users/x/dev/mori",
      sessions: [
        session({ id: "exact", projectPath: "/Users/x/dev/mori" }),
        session({ id: "look1", projectPath: "mori", title: "Codex 세션" }),
        session({ id: "look2", projectPath: "mori" }),
        session({ id: "unrelated", projectPath: "/dev/jinga" }),
      ],
    });
    // No confirmed aliases → only the exact path is connected.
    expect(result.connected.map((s) => s.id)).toEqual(["exact"]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      canonicalKey: "mori",
      count: 2,
      sampleTitle: "Codex 세션",
    });
    expect(result.candidates[0]!.sourceIds.sort()).toEqual(["look1", "look2"]);
  });

  it("returns empty partitions when nothing matches", () => {
    const result = buildProjectExternalSessions({
      projectKey: "/dev/mori",
      sessions: [session({ id: "x", projectPath: "/dev/jinga" })],
    });
    expect(result).toEqual({ connected: [], candidates: [] });
  });

  it("ignores sessions with no project label", () => {
    const result = buildProjectExternalSessions({
      projectKey: "/dev/mori",
      sessions: [session({ id: "blank", projectPath: undefined })],
    });
    expect(result.connected).toEqual([]);
    expect(result.candidates).toEqual([]);
  });
});
