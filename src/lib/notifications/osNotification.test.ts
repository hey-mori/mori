import { describe, expect, it } from "vitest";
import type { CompanionNotification, CompanionNotificationKind } from "./notification";
import {
  isOsEligibleKind,
  selectOsNotifications,
  toOsNotificationPayload,
} from "./osNotification";

const NOW = Date.parse("2026-06-10T12:00:00Z");

function notification(
  kind: CompanionNotificationKind,
  overrides: Partial<CompanionNotification> = {},
): CompanionNotification {
  return {
    id: overrides.id ?? `n-${kind}`,
    kind,
    severity: "info",
    title: "제목",
    message: "본문 메시지",
    basis: "verified",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "보기",
    actionTarget: null,
    createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe("isOsEligibleKind", () => {
  it("admits only the completed/detected kinds, not ambient triage", () => {
    expect(isOsEligibleKind("import_finished")).toBe(true);
    expect(isOsEligibleKind("package_export_ready")).toBe(true);
    expect(isOsEligibleKind("live_follow_update")).toBe(true);
    expect(isOsEligibleKind("memory_contradiction_detected")).toBe(true);
    // Ambient / suggestion kinds stay in the in-app feed.
    expect(isOsEligibleKind("weak_evidence")).toBe(false);
    expect(isOsEligibleKind("needs_review")).toBe(false);
    expect(isOsEligibleKind("suggested_next_action")).toBe(false);
    expect(isOsEligibleKind("demo_mode_notice")).toBe(false);
  });
});

describe("toOsNotificationPayload", () => {
  it("prefixes the title with the project context when present", () => {
    const payload = toOsNotificationPayload(
      notification("import_finished", {
        title: "가져오기 완료",
        message: "새 이벤트 12개",
        source: { projectLabel: "ng-gw" },
      }),
    );
    expect(payload.title).toBe("ng-gw · 가져오기 완료");
    expect(payload.body).toBe("새 이벤트 12개");
    expect(payload.notificationId).toBe("n-import_finished");
  });

  it("keeps the bare title when there is no project context", () => {
    const payload = toOsNotificationPayload(notification("live_follow_update", { title: "세션 업데이트" }));
    expect(payload.title).toBe("세션 업데이트");
  });

  it("collapses whitespace and clamps an overlong body", () => {
    const payload = toOsNotificationPayload(
      notification("package_export_ready", { message: `줄1\n\n줄2   ${"가".repeat(300)}` }),
    );
    expect(payload.body.startsWith("줄1 줄2 ")).toBe(true);
    expect(payload.body.endsWith("…")).toBe(true);
    expect(payload.body.length).toBeLessThanOrEqual(240);
  });
});

describe("selectOsNotifications", () => {
  it("returns payloads only for OS-eligible kinds, in feed order", () => {
    const feed = [
      notification("weak_evidence", { id: "a" }),
      notification("import_finished", { id: "b" }),
      notification("needs_review", { id: "c" }),
      notification("live_follow_update", { id: "d" }),
    ];
    const out = selectOsNotifications(feed, { now: NOW });
    expect(out.map((p) => p.notificationId)).toEqual(["b", "d"]);
  });

  it("skips ids already delivered to the OS, so a recomputed feed never re-fires", () => {
    const feed = [notification("import_finished", { id: "b" }), notification("live_follow_update", { id: "d" })];
    const out = selectOsNotifications(feed, { now: NOW, alreadyNotifiedIds: ["b"] });
    expect(out.map((p) => p.notificationId)).toEqual(["d"]);
  });

  it("dedupes repeats within a single batch", () => {
    const feed = [
      notification("import_finished", { id: "dup" }),
      notification("import_finished", { id: "dup" }),
    ];
    expect(selectOsNotifications(feed, { now: NOW })).toHaveLength(1);
  });

  it("drops eligible notices older than the freshness window", () => {
    const old = notification("import_finished", {
      id: "old",
      createdAt: new Date(NOW - 5 * 60 * 1000).toISOString(),
    });
    const fresh = notification("live_follow_update", {
      id: "fresh",
      createdAt: new Date(NOW - 30 * 1000).toISOString(),
    });
    const out = selectOsNotifications([old, fresh], { now: NOW });
    expect(out.map((p) => p.notificationId)).toEqual(["fresh"]);
  });

  it("never ages out an eligible notice that carries no timestamp", () => {
    const live = notification("live_follow_update", { id: "live", createdAt: undefined });
    const out = selectOsNotifications([live], { now: NOW });
    expect(out.map((p) => p.notificationId)).toEqual(["live"]);
  });

  it("carries the kind on the payload for cross-render cooldown bookkeeping", () => {
    const out = selectOsNotifications([notification("import_finished", { id: "b" })], { now: NOW });
    expect(out[0]?.kind).toBe("import_finished");
  });

  it("suppresses a muted kind so it never reaches the OS", () => {
    const feed = [
      notification("import_finished", { id: "b" }),
      notification("live_follow_update", { id: "d" }),
    ];
    const out = selectOsNotifications(feed, {
      now: NOW,
      isMuted: (kind) => kind === "import_finished",
    });
    expect(out.map((p) => p.notificationId)).toEqual(["d"]);
  });

  it("collapses a re-emitting kind to one ping per cooldown window", () => {
    const cooldownByKind = { import_finished: 5 * 60 * 1000 };
    // Each pass's notice is fresh relative to that pass's clock (the growing
    // session re-emits with a new id + timestamp every 90s); only the cooldown,
    // not the freshness window, should decide whether it pings.
    const at = (offsetMs: number, id: string) =>
      notification("import_finished", { id, createdAt: new Date(NOW + offsetMs).toISOString() });

    const first = selectOsNotifications([at(0, "at-1")], {
      now: NOW,
      cooldownByKind,
      lastNotifiedAtByKind: {},
    });
    expect(first.map((p) => p.notificationId)).toEqual(["at-1"]);

    // Second pass 90s later with a fresh id: within cooldown, suppressed.
    const second = selectOsNotifications([at(90 * 1000, "at-2")], {
      now: NOW + 90 * 1000,
      cooldownByKind,
      lastNotifiedAtByKind: { import_finished: NOW },
    });
    expect(second).toHaveLength(0);

    // Past the window, it pings again.
    const third = selectOsNotifications([at(6 * 60 * 1000, "at-3")], {
      now: NOW + 6 * 60 * 1000,
      cooldownByKind,
      lastNotifiedAtByKind: { import_finished: NOW },
    });
    expect(third.map((p) => p.notificationId)).toEqual(["at-3"]);
  });

  it("collapses two cooled-down notices in the same batch to one ping", () => {
    const feed = [
      notification("import_finished", { id: "x", createdAt: new Date(NOW).toISOString() }),
      notification("import_finished", { id: "y", createdAt: new Date(NOW).toISOString() }),
    ];
    const out = selectOsNotifications(feed, {
      now: NOW,
      cooldownByKind: { import_finished: 5 * 60 * 1000 },
    });
    expect(out.map((p) => p.notificationId)).toEqual(["x"]);
  });
});
