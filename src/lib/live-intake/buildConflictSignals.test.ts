import { describe, expect, it } from "vitest";
import { promoteNotificationSignals } from "../notifications/signalPolicy";
import { buildConflictSignals, findCrossSessionConflicts } from "./buildConflictSignals";
import { INTAKE_ROW_VERSION, type IntakeFileChange, type IntakeRequestRow } from "./intakeTypes";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");

function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function file(path: string, changeKind: IntakeFileChange["changeKind"]): IntakeFileChange {
  return { path, changeKind, additions: 3, deletions: 1, touchCount: 1 };
}

function row(partial: Partial<IntakeRequestRow> & { id: string }): IntakeRequestRow {
  return {
    schemaVersion: INTAKE_ROW_VERSION,
    sessionKey: "/s/a.jsonl",
    projectPath: "C:\\dev\\mori",
    sessionLabel: "mori",
    title: "an ask",
    titleTruncated: false,
    startedAt: ago(10),
    endedAt: ago(1),
    stepCount: 5,
    tools: [],
    files: [file("src/app.ts", "edited")],
    hasError: false,
    status: "running",
    locator: { path: "/s/a.jsonl", offset: 0 },
    observedAt: ago(1),
    ...partial,
  };
}

function find(rows: IntakeRequestRow[]) {
  return findCrossSessionConflicts({ rows, now: NOW });
}

describe("findCrossSessionConflicts", () => {
  it("finds two sessions changing the same file", () => {
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl" }),
      row({ id: "b", sessionKey: "/s/b.jsonl", sessionLabel: "mori" }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("src/app.ts");
    expect(out[0].sessions.map((s) => s.sessionKey).sort()).toEqual([
      "/s/a.jsonl",
      "/s/b.jsonl",
    ]);
  });

  it("does not call two reads a conflict", () => {
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl", files: [file("src/app.ts", "read")] }),
      row({ id: "b", sessionKey: "/s/b.jsonl", files: [file("src/app.ts", "read")] }),
    ]);

    expect(out).toEqual([]);
  });

  it("does not conflict a read against a write", () => {
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl", files: [file("src/app.ts", "edited")] }),
      row({ id: "b", sessionKey: "/s/b.jsonl", files: [file("src/app.ts", "read")] }),
    ]);

    expect(out).toEqual([]);
  });

  it("does not conflict a session with itself", () => {
    // Two requests in one session touching a file is sequential work.
    const out = find([
      row({ id: "a1", sessionKey: "/s/a.jsonl" }),
      row({ id: "a2", sessionKey: "/s/a.jsonl" }),
    ]);

    expect(out).toEqual([]);
  });

  it("does not conflict across two different projects", () => {
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl", projectPath: "C:\\dev\\one" }),
      row({ id: "b", sessionKey: "/s/b.jsonl", projectPath: "C:\\dev\\two" }),
    ]);

    expect(out).toEqual([]);
  });

  it("says nothing when both runs already finished", () => {
    // History, not a collision: nothing is in flight to clobber anything.
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl", status: "completed" }),
      row({ id: "b", sessionKey: "/s/b.jsonl", status: "completed" }),
    ]);

    expect(out).toEqual([]);
  });

  it("does flag a running run against one that just finished", () => {
    // The dangerous case: the finished run's edits are already on disk.
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl", status: "running" }),
      row({ id: "b", sessionKey: "/s/b.jsonl", status: "completed", endedAt: ago(3) }),
    ]);

    expect(out).toHaveLength(1);
  });

  it("ignores a run that finished long ago", () => {
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl", status: "running" }),
      row({ id: "b", sessionKey: "/s/b.jsonl", status: "completed", endedAt: ago(600) }),
    ]);

    expect(out).toEqual([]);
  });

  it("ignores rows Mori has not observed recently", () => {
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl" }),
      row({ id: "b", sessionKey: "/s/b.jsonl", observedAt: ago(600) }),
    ]);

    expect(out).toEqual([]);
  });

  it("keeps a project path containing spaces intact", () => {
    // A joined key split back apart would break here, which is why the parts
    // are carried rather than reparsed.
    const project = "C:\\Users\\Admin\\My Project";
    const out = find([
      row({ id: "a", sessionKey: "/s/a.jsonl", projectPath: project }),
      row({ id: "b", sessionKey: "/s/b.jsonl", projectPath: project }),
    ]);

    expect(out[0]).toMatchObject({ projectPath: project, path: "src/app.ts" });
  });

  it("reports one finding per file, not per row", () => {
    const out = find([
      row({ id: "a1", sessionKey: "/s/a.jsonl" }),
      row({ id: "a2", sessionKey: "/s/a.jsonl" }),
      row({ id: "b", sessionKey: "/s/b.jsonl" }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].sessions).toHaveLength(2);
  });

  it("returns nothing for no rows", () => {
    expect(find([])).toEqual([]);
  });
});

describe("buildConflictSignals through the policy", () => {
  it("surfaces in-app and never escalates to the OS", () => {
    // "These two changes fight" is an inference even when both changes are fact,
    // so the policy holds it in-app. Asserting it here keeps that intentional.
    const candidates = buildConflictSignals({
      rows: [row({ id: "a", sessionKey: "/s/a.jsonl" }), row({ id: "b", sessionKey: "/s/b.jsonl" })],
      now: NOW,
    });
    const promoted = promoteNotificationSignals(candidates, { allowSystem: true });

    expect(promoted[0].reason).toBe("conflictDetected");
    expect(promoted[0].delivery).toBe("inApp");
  });

  it("keeps two different files as two signals rather than batching them away", () => {
    const rows = [
      row({ id: "a", sessionKey: "/s/a.jsonl", files: [file("one.ts", "edited"), file("two.ts", "edited")] }),
      row({ id: "b", sessionKey: "/s/b.jsonl", files: [file("one.ts", "edited"), file("two.ts", "edited")] }),
    ];
    const promoted = promoteNotificationSignals(buildConflictSignals({ rows, now: NOW }));

    expect(promoted.filter((s) => s.delivery === "inApp")).toHaveLength(2);
  });
});
