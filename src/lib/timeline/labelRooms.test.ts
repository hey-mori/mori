import { describe, expect, it } from "vitest";
import { LABEL_ROOM_MAX, LABEL_ROOM_MIN, labelRooms } from "./collisionLayout";
import { labelText } from "../../features/timeline/TimelineEventCard";

describe("label room beside a timeline item", () => {
  it("is the free space up to the next item that starts after it, minus a gap", () => {
    expect(labelRooms([{ x: 100, width: 6 }, { x: 200, width: 6 }], 1000)).toEqual([88, LABEL_ROOM_MAX]);
  });

  it("is none when the next item is too close or overlaps, and never moves an item", () => {
    const placements = [{ x: 100, width: 6 }, { x: 120, width: 6 }, { x: 110, width: 40 }];
    const before = JSON.stringify(placements);
    const rooms = labelRooms(placements, 1000);
    expect(rooms[0]).toBe(0);
    expect(rooms[2]).toBe(0);
    expect(JSON.stringify(placements)).toBe(before);
  });

  it("stops at the content edge and is capped", () => {
    expect(labelRooms([{ x: 900, width: 6 }], 1000)).toEqual([88]);
    expect(labelRooms([{ x: 0, width: 6 }], 5000)).toEqual([LABEL_ROOM_MAX]);
    expect(labelRooms([{ x: 960, width: 6 }], 1000)[0]).toBe(0);
    expect(LABEL_ROOM_MIN).toBeGreaterThan(0);
  });
});

describe("label text", () => {
  it("drops the reader's leading tool glyph and keeps the rest", () => {
    expect(labelText("🔧 Bash: run tests")).toBe("Bash: run tests");
    expect(labelText("CI 실행 기록")).toBe("CI 실행 기록");
  });
});
