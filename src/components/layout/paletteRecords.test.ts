import { describe, expect, it } from "vitest";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { CommandEntry } from "../../lib/commandPalette/commandPalette";
import { recordToEntry, withoutDuplicateSessions } from "./paletteRecords";

const registry = createSchemaRegistry();
const contexts: KernelContext[] = [
  { id: "ctx-work", type: "project", name: "회사", createdAt: "x" },
  { id: "ctx-personal", type: "project", name: "개인", createdAt: "x" },
  { id: "ctx-infra-w", type: "project", name: "infra", parentId: "ctx-work", createdAt: "x" },
  { id: "ctx-infra-p", type: "project", name: "infra", parentId: "ctx-personal", createdAt: "x" },
  { id: "ctx-routine", type: "routine", name: "아침", createdAt: "x" },
];
const record = (overrides: Partial<MoriRecord>): MoriRecord => ({
  id: "auto-claude-x",
  schemaId: "agent-session",
  title: "저장소 접근 작업",
  body: "Claude Code 세션",
  capturedAt: "2026-10-08T00:00:00Z",
  occurredStart: "2026-10-08T00:00:00Z",
  timeBasis: "source-observed",
  status: "active",
  origin: "automation",
  ownership: "db",
  contextIds: [],
  properties: { agentId: "claude" },
  createdAt: "2026-10-08T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  ...overrides,
});

describe("palette record rows", () => {
  it("names the project, not a routine listed first, and uses the path for twins (C2, B5)", () => {
    const entry = recordToEntry(record({ contextIds: ["ctx-routine", "ctx-infra-w"] }), registry, contexts);
    expect(entry.hint).toContain("회사/infra");
    expect(entry.hint).not.toContain("아침");
  });

  it("names no project for an unconfirmed session", () => {
    expect(recordToEntry(record({}), registry, contexts).hint).not.toContain("infra");
  });

  it("opens an agent session as the session and a note as the record (E1)", () => {
    expect(recordToEntry(record({}), registry, contexts).target).toEqual({ kind: "openAgentSession", sessionId: "auto-claude-x" });
    expect(recordToEntry(record({ id: "n1", schemaId: "note" }), registry, contexts).target).toEqual({ kind: "openRecord", recordId: "n1" });
  });

  it("shows one row per logical session (E3)", () => {
    const sessionCommand: CommandEntry = { id: "session:auto-claude-x", group: "session", label: "저장소 접근 작업", target: { kind: "openSession", sessionId: "auto-claude-x", tab: "flow" } };
    const otherSession: CommandEntry = { id: "session:auto-claude-y", group: "session", label: "다른 작업", target: { kind: "openSession", sessionId: "auto-claude-y", tab: "flow" } };
    const rows = withoutDuplicateSessions([sessionCommand, otherSession], [recordToEntry(record({}), registry, contexts)]);
    expect(rows.map((row) => row.id)).toEqual(["session:auto-claude-y"]);
  });

  it("carries no path or transcript text beyond the stored title and body (F5)", () => {
    const entry = recordToEntry(record({ contextIds: ["ctx-infra-w"] }), registry, contexts);
    expect(JSON.stringify(entry)).not.toMatch(/\/home\/|worktree/);
  });
});
