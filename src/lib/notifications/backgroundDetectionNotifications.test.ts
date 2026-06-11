import { describe, expect, it } from "vitest";
import {
  buildBackgroundDetectionNotifications,
  type DetectedInboxNotice,
} from "./backgroundDetectionNotifications";

const notice = (
  path: string,
  fileName: string,
  kind: "new" | "updated",
  detectedAt: string,
): DetectedInboxNotice => ({ path, fileName, kind, detectedAt });

describe("buildBackgroundDetectionNotifications", () => {
  it("maps a detection to a feed event that deep-links into the 소스 view", () => {
    const [n] = buildBackgroundDetectionNotifications([
      notice("/inbox/a.jsonl", "a.jsonl", "new", "2026-06-11T10:00:00.000Z"),
    ]);
    expect(n).toMatchObject({
      id: "background-detection:/inbox/a.jsonl",
      kind: "background_detection",
      severity: "info",
      actionTarget: { kind: "view", view: "connections" },
      createdAt: "2026-06-11T10:00:00.000Z",
    });
    expect(n?.title).toContain("a.jsonl");
    expect(n?.title).toContain("새 작업");
  });

  it("distinguishes a grown file as an update", () => {
    const [n] = buildBackgroundDetectionNotifications([
      notice("/inbox/b.jsonl", "b.jsonl", "updated", "2026-06-11T10:00:00.000Z"),
    ]);
    expect(n?.title).toContain("업데이트");
  });

  it("sorts newest first and caps the burst", () => {
    const detections = Array.from({ length: 8 }, (_, i) =>
      notice(`/inbox/${i}.jsonl`, `${i}.jsonl`, "new", `2026-06-11T10:0${i}:00.000Z`),
    );
    const built = buildBackgroundDetectionNotifications(detections, 5);
    expect(built).toHaveLength(5);
    expect(built[0]?.id).toBe("background-detection:/inbox/7.jsonl");
  });
});
