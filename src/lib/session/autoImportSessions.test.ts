import { describe, expect, it } from "vitest";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import {
  agentSessionFingerprint,
  agentSessionToStoredDraft,
  autoImportedProjectId,
  autoImportedSessionId,
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
