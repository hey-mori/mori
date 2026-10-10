import { describe, expect, it } from "vitest";
import type { KernelSource, MoriRecord, SourceLink } from "../record-kernel/kernelTypes";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { autoImportedSessionId } from "./autoImportSessions";
import { passageCounts, retentionSources, sessionsWithKeptEvidence } from "./retentionInventory";
import { formatArchiveLocator } from "./sessionArchive";

const meta = (id: string, overrides: Partial<AgentWorkSessionMeta> = {}): AgentWorkSessionMeta =>
  ({
    agentId: "claude",
    agentName: "Claude",
    importKind: "claude-code",
    id,
    sessionId: id,
    projectPath: "/p",
    projectName: "p",
    filePath: `/c/${id}.jsonl`,
    sourceFilePath: `/c/${id}.jsonl`,
    startedAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    messageCount: 3,
    title: `T ${id}`,
    ...overrides,
  }) as AgentWorkSessionMeta;

const source = (id: string, locator: string, retention: KernelSource["retention"] = "retained"): KernelSource => ({
  id,
  kind: "agent-session",
  locator,
  capturedAt: "2026-09-03T00:00:00Z",
  retention,
});
const record = (id: string, status = "active"): MoriRecord => ({ id, status }) as unknown as MoriRecord;
const link = (sourceId: string, recordId: string): SourceLink => ({ sourceId, recordId, role: "origin" });

describe("what Mori keeps of each registered source", () => {
  const a = autoImportedSessionId(meta("a"));

  it("counts passages that still back a live record, once per record", () => {
    const sources = [source("s1", `mori:session/${a}#1:x:0-4`), source("s2", `mori:session/${a}#9:y:0-2`), source("s3", `mori:session/${a}#5:z:0-1`)];
    const counts = passageCounts(
      sources,
      [link("s1", "r1"), link("s2", "r1"), link("s3", "gone")],
      [record("r1"), record("gone", "discarded")],
    );
    expect(counts.get(a)).toBe(1);
  });

  it("joins file time, archive, passages and import by the Mori session id", () => {
    const archive = source(
      "arc",
      formatArchiveLocator({ v: 1, kind: "claude-code-archive", sessionId: a, fileName: `${"0".repeat(64)}.jsonl`, sha256: "0".repeat(64), bytes: 10, sourceId: "x" }),
    );
    const [only] = retentionSources({
      metas: [meta("a", { modifiedAt: "2026-09-05T00:00:00Z", fileBytes: 12 })],
      sources: [archive],
      links: [],
      records: [],
      importedSessionIds: new Set([a]),
    });
    expect(only).toMatchObject({
      sessionId: a,
      modifiedAt: "2026-09-05T00:00:00Z",
      bytes: 12,
      presence: "unknown",
      archive: { bytes: 10 },
      imported: true,
      sourcePath: "/c/a.jsonl",
    });
  });

  it("falls back to the last activity for metas stored before the file time", () => {
    const [only] = retentionSources({ metas: [meta("a")], sources: [], links: [], records: [], importedSessionIds: new Set() });
    expect(only.modifiedAt).toBe("2026-09-02T00:00:00Z");
  });

  it("considers only Claude Code transcripts", () => {
    const list = retentionSources({
      metas: [meta("a"), meta("d", { importKind: "claude-desktop" } as Partial<AgentWorkSessionMeta>)],
      sources: [],
      links: [],
      records: [],
      importedSessionIds: new Set(),
    });
    expect(list.map((s) => s.sessionId)).toEqual([a]);
  });
});

describe("what helps decide whether to keep a source", () => {
  it("names its folder, a whole message count and the PRs it mentions", () => {
    const [whole] = retentionSources({
      metas: [
        meta("a", {
          projectPath: "/home/u/dev/mori",
          messageCount: 120,
          messageCountComplete: true,
          evidence: { prs: [{ repository: "o/r", number: 1 }, { repository: "o/r", number: 2 }] } as AgentWorkSessionMeta["evidence"],
        }),
      ],
      sources: [],
      links: [],
      records: [],
      importedSessionIds: new Set(),
    });
    expect(whole).toMatchObject({ projectLabel: "/home/u/dev/mori", messageCount: 120, prCount: 2 });
    const [partial] = retentionSources({
      metas: [meta("b", { messageCount: 40, messageCountComplete: false })],
      sources: [],
      links: [],
      records: [],
      importedSessionIds: new Set(),
    });
    expect(partial.messageCount).toBeUndefined();
    expect(partial.prCount).toBeUndefined();
  });
});

describe("sessions whose reopen descriptor must outlive the original", () => {
  const archiveLocator = (sessionId: string) =>
    formatArchiveLocator({ v: 1, kind: "claude-code-archive", sessionId, fileName: `${"1".repeat(64)}.jsonl`, sha256: "1".repeat(64), bytes: 5, sourceId: "x" });

  it("are those with a kept archive or a saved passage", () => {
    const ids = sessionsWithKeptEvidence([
      source("a1", archiveLocator("auto-claude-archived")),
      source("p1", "mori:session/auto-claude-passage#3:q:0-9", "redacted"),
      source("gone", archiveLocator("auto-claude-removed"), "notCaptured"),
      source("other", "claude-code:/some/path"),
    ]);
    expect([...ids].sort()).toEqual(["auto-claude-archived", "auto-claude-passage"]);
  });
});
