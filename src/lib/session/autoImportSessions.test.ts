import { describe, expect, it } from "vitest";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import {
  agentSessionFingerprint,
  agentSessionToStoredDraft,
  autoImportedProjectId,
  autoImportedSessionId,
  carryForwardRepository,
  diffDiscoveredSessions,
  isAutoImportedSessionId,
  isUnreadableAgentSession,
  seenFingerprintsFromMetas,
} from "./autoImportSessions";

function meta(overrides: Partial<AgentWorkSessionMeta> & { id: string }): AgentWorkSessionMeta {
  return {
    agentId: "claude" as AgentWorkSessionMeta["agentId"],
    agentName: "Claude Code",
    importKind: "claude-code" as AgentWorkSessionMeta["importKind"],
    sessionId: overrides.id,
    projectPath: "C:/dev/mori",
    projectName: "mori",
    filePath: `/x/${overrides.id}.jsonl`,
    sourceFilePath: `/x/${overrides.id}.jsonl`,
    startedAt: "2026-07-14T09:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z",
    messageCount: 12,
    title: "Fix calendar time mismatch",
    ...overrides,
  };
}

describe("autoImportedSessionId", () => {
  it("is stable for the same discovery id and namespaced by agent", () => {
    const a = autoImportedSessionId(meta({ id: "abc" }));
    const b = autoImportedSessionId(meta({ id: "abc" }));
    expect(a).toBe(b);
    expect(a.startsWith("auto-claude-")).toBe(true);
    expect(isAutoImportedSessionId(a)).toBe(true);
  });

  it("differs for different discovery ids", () => {
    expect(autoImportedSessionId(meta({ id: "abc" }))).not.toBe(
      autoImportedSessionId(meta({ id: "def" })),
    );
  });

  it("does not flag a manual (timestamp) id as auto-imported", () => {
    expect(isAutoImportedSessionId("sess-fix-20260714090000")).toBe(false);
  });
});

describe("autoImportedProjectId", () => {
  it("is stable per project path so grouping does not fragment", () => {
    expect(autoImportedProjectId(meta({ id: "a" }))).toBe(
      autoImportedProjectId(meta({ id: "b" })),
    );
  });
});

describe("agentSessionToStoredDraft", () => {
  it("maps a discovery meta to a metadata-only draft with a stable id and pinned savedAt", () => {
    const draft = agentSessionToStoredDraft(meta({ id: "abc" }));
    expect(draft.session.id).toBe(autoImportedSessionId(meta({ id: "abc" })));
    expect(draft.session.title).toBe("Fix calendar time mismatch");
    expect(draft.session.status).toBe("complete");
    expect(draft.session.sourceLabel).toBe("C:/dev/mori");
    expect(draft.project.name).toBe("mori");
    // savedAt is pinned to the session's activity time, not "now".
    expect(draft.savedAt).toBe("2026-07-14T10:00:00.000Z");
    expect(draft.adapter).toBe("browser-local-storage");
  });

  it("falls back to a placeholder title when the discovery title is blank", () => {
    expect(agentSessionToStoredDraft(meta({ id: "a", title: "  " })).session.title).toBe("제목 없음");
  });
});

describe("isUnreadableAgentSession", () => {
  it("flags the ⚠ placeholder metas Codex emits", () => {
    expect(isUnreadableAgentSession(meta({ id: "a", title: "⚠ 읽을 수 없는 세션 · 파싱 실패" }))).toBe(true);
    expect(isUnreadableAgentSession(meta({ id: "a", title: "Real title" }))).toBe(false);
  });
});

describe("diffDiscoveredSessions", () => {
  it("classifies new, changed, and unchanged sessions", () => {
    const s1 = meta({ id: "s1" });
    const s2 = meta({ id: "s2", messageCount: 5 });
    const seen = new Map([
      [autoImportedSessionId(s1), agentSessionFingerprint(s1)], // unchanged
      [autoImportedSessionId(s2), "old|3"], // changed
    ]);
    const s3 = meta({ id: "s3" }); // new
    const diff = diffDiscoveredSessions([s1, s2, s3], seen);
    expect(diff.newCount).toBe(1);
    expect(diff.updatedCount).toBe(1);
    expect(diff.toUpsert.map((m) => m.id).sort()).toEqual(["s2", "s3"]);
  });

  it("skips unreadable placeholders and within-batch duplicates", () => {
    const s1 = meta({ id: "s1" });
    const dupe = meta({ id: "s1", messageCount: 99 });
    const bad = meta({ id: "s2", title: "⚠ MB 초과" });
    const diff = diffDiscoveredSessions([s1, dupe, bad], new Map());
    expect(diff.newCount).toBe(1);
    expect(diff.toUpsert).toHaveLength(1);
    expect(diff.toUpsert[0].id).toBe("s1");
  });

  it("returns nothing to upsert when everything is unchanged", () => {
    const s1 = meta({ id: "s1" });
    const seen = seenFingerprintsFromMetas([s1]);
    const diff = diffDiscoveredSessions([s1], seen);
    expect(diff.toUpsert).toHaveLength(0);
    expect(diff.newCount).toBe(0);
    expect(diff.updatedCount).toBe(0);
  });
});

describe("agentSessionFingerprint · a growing Claude session", () => {
  it("changes when only the transcript's last activity moved, so growth is re-observed", () => {
    // A long session's preview count is capped, so the count alone never moves.
    const earlier = { startedAt: "2026-10-07T13:48:42Z", updatedAt: "2026-10-07T14:00:00Z", messageCount: 46, title: "t" };
    const later = { ...earlier, updatedAt: "2026-10-07T15:30:00Z" };
    expect(agentSessionFingerprint(later)).not.toBe(agentSessionFingerprint(earlier));
  });
});

describe("agentSessionFingerprint · a re-derived title", () => {
  it("changes when only the title changed, so an improved reader reaches existing records", () => {
    const before = { startedAt: "2026-09-02T12:13:57Z", updatedAt: "2026-09-02T12:14:13Z", messageCount: 4, title: "<recommended_plugins> Here is a list of" };
    const after = { ...before, title: "Inspect repository and environment" };
    expect(agentSessionFingerprint(after)).not.toBe(agentSessionFingerprint(before));
    expect(agentSessionFingerprint({ ...before })).toBe(agentSessionFingerprint(before));
  });
});

describe("diffDiscoveredSessions · empty sources (capture policy, 2026-10-08)", () => {
  const evidence = (prs: number[], complete = true) => ({
    prs: prs.map((number) => ({
      repository: "acme/app",
      number,
      url: "",
      firstObservedAt: "",
      firstLine: number,
      observations: 1,
    })),
    branches: [],
    repositories: ["acme/app"],
    complete,
  });

  it("recognises a new source a complete read proved empty without registering it", () => {
    const diff = diffDiscoveredSessions(
      [
        meta({ id: "stub", activityClass: "empty" }),
        meta({ id: "cut", activityClass: "unknown" }),
        meta({ id: "model", activityClass: "command-only" }),
      ],
      new Map(),
    );
    expect(diff.emptySources.map((entry) => entry.id)).toEqual(["stub"]);
    // A partial read is not proof of emptiness, and a command is real activity.
    expect(diff.toUpsert.map((entry) => entry.id)).toEqual(["cut", "model"]);
    expect(diff.newCount).toBe(2);
  });

  it("keeps updating a session registered before it was classified empty", () => {
    const registered = meta({ id: "old-stub" });
    const seen = new Map([[autoImportedSessionId(registered), agentSessionFingerprint(registered)]]);
    const diff = diffDiscoveredSessions([meta({ id: "old-stub", activityClass: "empty" })], seen);
    expect(diff.toUpsert.map((entry) => entry.id)).toEqual(["old-stub"]);
    expect(diff.emptySources).toEqual([]);
  });

  it("re-observes a session when a PR is newly linked or its scan completes, not when nothing changed", () => {
    const base = meta({ id: "s", evidence: evidence([137], false) });
    const same = meta({ id: "s", evidence: evidence([137], false) });
    const newPr = meta({ id: "s", evidence: evidence([137, 139], false) });
    const completed = meta({ id: "s", evidence: evidence([137], true) });
    expect(agentSessionFingerprint(same)).toBe(agentSessionFingerprint(base));
    expect(agentSessionFingerprint(newPr)).not.toBe(agentSessionFingerprint(base));
    expect(agentSessionFingerprint(completed)).not.toBe(agentSessionFingerprint(base));
  });
});

describe("agentSessionToStoredDraft · repository identity", () => {
  const repo = (root: string, basis: "session-record" | "git-worktree" | "git-checkout" | "", conflict = false) => ({
    root,
    basis,
    worktreePath: "",
    conflict,
  });

  it("keeps the established checkout beside the folder, never in its place", () => {
    const draft = agentSessionToStoredDraft(
      meta({ id: "wt", projectPath: "/home/u/dev", repository: repo("/home/u/dev/infra", "session-record") }),
    );
    expect(draft.session.sourceLabel).toBe("/home/u/dev");
    expect(draft.session.sourceRepository).toBe("/home/u/dev/infra");
    expect(draft.session.sourceRepositoryBasis).toBe("session-record");
  });

  it("records no checkout when the evidence contradicts itself", () => {
    const draft = agentSessionToStoredDraft(meta({ id: "c", repository: repo("/home/u/dev/infra", "", true) }));
    expect(draft.session.sourceRepository).toBeUndefined();
  });

  it("re-observes a session once its checkout becomes known", () => {
    const before = meta({ id: "s" });
    const after = meta({ id: "s", repository: repo("/home/u/dev/infra", "git-worktree") });
    expect(agentSessionFingerprint(after)).not.toBe(agentSessionFingerprint(before));
    expect(agentSessionFingerprint(meta({ id: "s", repository: repo("/home/u/dev/infra", "git-worktree") }))).toBe(
      agentSessionFingerprint(after),
    );
  });
});

describe("carryForwardRepository · a partial rescan after restart", () => {
  const known = { root: "/home/u/dev/infra", basis: "session-record" as const, worktreePath: "/w", conflict: false };
  const ev = (complete: boolean) => ({ prs: [], branches: [], repositories: [], complete });

  it("keeps the checkout a fuller read found while the source is only partly read", () => {
    const previous = meta({ id: "wt", repository: known, evidence: ev(true) });
    const next = meta({ id: "wt", evidence: ev(false) });
    expect(carryForwardRepository(next, previous).repository).toEqual(known);
    // Same fingerprint input as before: the draft is not re-registered without it.
    expect(agentSessionToStoredDraft(carryForwardRepository(next, previous)).session.sourceRepository).toBe("/home/u/dev/infra");
  });

  it("lets a complete read decide, even when it finds no checkout", () => {
    const previous = meta({ id: "wt", repository: known, evidence: ev(true) });
    expect(carryForwardRepository(meta({ id: "wt", evidence: ev(true) }), previous).repository).toBeUndefined();
  });

  it("lets a partial read that found its own identity decide", () => {
    const other = { ...known, root: "/home/u/dev/other", basis: "git-worktree" as const };
    const previous = meta({ id: "wt", repository: known, evidence: ev(true) });
    expect(carryForwardRepository(meta({ id: "wt", repository: other, evidence: ev(false) }), previous).repository).toEqual(other);
  });
});
