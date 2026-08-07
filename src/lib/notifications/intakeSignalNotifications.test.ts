import { describe, expect, it } from "vitest";
import { INTAKE_ROW_VERSION, type IntakeRequestRow } from "../live-intake/intakeTypes";
import type { ConflictFinding } from "../live-intake/buildConflictSignals";
import type { PromotedSignal } from "./signalPolicy";
import { buildConflictNotification, buildIntakeSignalNotification } from "./intakeSignalNotifications";

function row(partial: Partial<IntakeRequestRow> = {}): IntakeRequestRow {
  return {
    schemaVersion: INTAKE_ROW_VERSION,
    id: "/s/a.jsonl::m1",
    sessionKey: "/s/a.jsonl",
    projectPath: "C:\\dev\\mori",
    sessionLabel: "mori",
    title: "라우팅 테이블 재설계",
    titleTruncated: false,
    startedAt: "2026-08-07T11:00:00.000Z",
    endedAt: "2026-08-07T11:20:00.000Z",
    stepCount: 12,
    tools: ["Edit"],
    files: [],
    hasError: false,
    status: "completed",
    locator: { path: "/s/a.jsonl", offset: 0 },
    observedAt: "2026-08-07T11:20:00.000Z",
    ...partial,
  };
}

function signal(reason: PromotedSignal["reason"]): PromotedSignal {
  return {
    id: `intake:${reason}:/s/a.jsonl::m1`,
    reason,
    severity: "info",
    delivery: "inApp",
    policyNote: "test",
  };
}

describe("buildIntakeSignalNotification", () => {
  it("names a completion and carries the request as the body", () => {
    const notification = buildIntakeSignalNotification(signal("sessionCompleted"), row());

    expect(notification?.title).toBe("작업을 마쳤습니다");
    expect(notification?.message).toContain("라우팅 테이블 재설계");
    expect(notification?.message).toContain("12단계");
  });

  it("says so when the run ended in error", () => {
    const notification = buildIntakeSignalNotification(
      signal("sessionCompleted"),
      row({ hasError: true }),
    );

    expect(notification?.title).toContain("오류");
  });

  it("marks a block for review rather than as information", () => {
    const notification = buildIntakeSignalNotification(signal("blocked"), row({ status: "blocked" }));

    expect(notification?.severity).toBe("review");
  });

  it("returns null for a reason it has no copy for", () => {
    // An unhandled reason must stay visibly unhandled rather than reaching the
    // user as a generic string.
    expect(buildIntakeSignalNotification(signal("needsUserDecision"), row())).toBeNull();
  });

  it("takes its id from the signal, so a repeat collapses instead of stacking", () => {
    const s = signal("sessionCompleted");
    expect(buildIntakeSignalNotification(s, row())?.id).toBe(s.id);
  });

  it("opens 세션, the nav destination, not the bare live route", () => {
    // `liveSession` renders the feed with no session index beside it, so
    // arriving there from a notification strands the user. This matches what
    // sessionSyncNotifications already does.
    expect(buildIntakeSignalNotification(signal("sessionCompleted"), row())?.actionTarget).toEqual({
      kind: "view",
      view: "sessions",
    });
  });

  it("carries no raw step text, only the user's own request", () => {
    const notification = buildIntakeSignalNotification(
      signal("sessionCompleted"),
      row({ tools: ["Bash", "Edit"] }),
    );

    expect(JSON.stringify(notification)).not.toContain("Bash");
  });
});

describe("buildConflictNotification", () => {
  const finding: ConflictFinding = {
    path: "C:\\dev\\mori\\src\\gateway\\routes.ts",
    projectPath: "C:\\dev\\mori",
    at: "2026-08-07T11:20:00.000Z",
    sessions: [
      { sessionKey: "/s/a.jsonl", sessionLabel: "mori", requestId: "r1", status: "running" },
      { sessionKey: "/s/b.jsonl", sessionLabel: "mori", requestId: "r2", status: "completed" },
    ],
  };

  it("links both sessions as evidence, since the point is to open both traces", () => {
    const notification = buildConflictNotification(finding);

    expect(notification.evidenceRefs).toEqual(["/s/a.jsonl", "/s/b.jsonl"]);
    expect(notification.linkedItemIds).toEqual(["r1", "r2"]);
  });

  it("names the file without spelling out its whole path", () => {
    const notification = buildConflictNotification(finding);

    expect(notification.message).toContain("gateway/routes.ts");
    expect(notification.message).not.toContain("C:\\dev");
  });

  it("reports a mixed basis, because the collision is Mori's reading", () => {
    // The file changes are observed fact; that they fight is inference.
    expect(buildConflictNotification(finding).basis).toBe("mixed");
  });

  it("opens 세션 as well", () => {
    expect(buildConflictNotification(finding).actionTarget).toEqual({
      kind: "view",
      view: "sessions",
    });
  });
});
