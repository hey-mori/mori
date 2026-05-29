import { describe, expect, it } from "vitest";
import {
  composeNotifications,
  companionSignalToNotification,
  type CompanionNotification,
} from "../../lib/notifications/notification";
import type { CompanionSignal } from "../../lib/companion/companionSignals";

/**
 * The hook itself is a React hook so it's exercised at integration; what we
 * lock down here is the contract it composes against — Companion signals
 * adapt cleanly through composeNotifications, and a second producer can
 * stack on top without losing the Companion order. This is the same compose
 * shape `useNotifications` runs, so a regression in either layer surfaces
 * here.
 */

function signal(partial: Partial<CompanionSignal>): CompanionSignal {
  return {
    id: partial.id ?? "sig-1",
    type: partial.type ?? "unresolved_issue",
    severity: partial.severity ?? "review",
    title: partial.title ?? "Issue",
    message: partial.message ?? "",
    sourceSurface: partial.sourceSurface ?? "review",
    linkedItemIds: partial.linkedItemIds ?? [],
    evidenceRefs: partial.evidenceRefs ?? [],
    basis: partial.basis ?? "verified",
    actionLabel: partial.actionLabel ?? "검토",
    destination: partial.destination ?? "review",
    audience: partial.audience ?? "real",
  };
}

describe("useNotifications compose contract", () => {
  it("preserves Companion feed order through the producer-neutral compose", () => {
    const companion: CompanionNotification[] = [
      signal({ id: "a", title: "결정 1건 확인 필요" }),
      signal({ id: "b", title: "열린 이슈 4건" }),
    ].map((s) => companionSignalToNotification(s, { kind: "view", view: "review" }));
    const composed = composeNotifications([companion]);
    expect(composed.map((n) => n.id)).toEqual(["a", "b"]);
    expect(composed.map((n) => n.title)).toEqual([
      "결정 1건 확인 필요",
      "열린 이슈 4건",
    ]);
  });

  it("lets a future producer fan in without rewriting the Companion path", () => {
    const companion: CompanionNotification[] = [
      companionSignalToNotification(signal({ id: "comp-1" }), null),
    ];
    const futureProducer: CompanionNotification[] = [
      {
        id: "import-finished-batch-77",
        kind: "import_finished",
        severity: "info",
        title: "Claude 세션 3개 가져오기 완료",
        message: "방금 가져오기로 추가했습니다.",
        basis: "state",
        linkedItemIds: [],
        evidenceRefs: [],
        actionLabel: "세션 보기",
        actionTarget: { kind: "view", view: "workspace" },
      },
    ];
    const composed = composeNotifications([futureProducer, companion]);
    // Future producer was registered first → leads the feed.
    expect(composed.map((n) => n.id)).toEqual([
      "import-finished-batch-77",
      "comp-1",
    ]);
  });

  it("deduplicates by id when both producers raise the same notification", () => {
    const duplicate: CompanionNotification = {
      id: "shared-id",
      kind: "stale_memory",
      severity: "review",
      title: "first wins",
      message: "",
      basis: "mixed",
      linkedItemIds: [],
      evidenceRefs: [],
      actionLabel: "x",
      actionTarget: null,
    };
    const composed = composeNotifications([
      [duplicate],
      [{ ...duplicate, title: "second" }],
    ]);
    expect(composed).toHaveLength(1);
    expect(composed[0]!.title).toBe("first wins");
  });
});
