import { describe, expect, it } from "vitest";
import { LABEL_ROOM_MAX, LABEL_ROOM_MIN, labelRooms } from "./collisionLayout";

describe("label room beside a timeline item", () => {
  it("is the free space up to the next item that starts after it, minus a gap", () => {
    expect(labelRooms([{ x: 100, width: 6 }, { x: 200, width: 6 }], 1000)).toEqual([83, LABEL_ROOM_MAX]);
  });

  it("is none when the next item is too close or overlaps, and never moves an item", () => {
    const placements = [{ x: 100, width: 6 }, { x: 120, width: 6 }, { x: 110, width: 40 }];
    const before = JSON.stringify(placements);
    const rooms = labelRooms(placements, 1000);
    expect(rooms[0]).toBe(0);
    expect(rooms[2]).toBe(0);
    // The tick at 120 sits under the wide item spanning 110-150: no label over it.
    expect(rooms[1]).toBe(0);
    expect(JSON.stringify(placements)).toBe(before);
  });

  it("stops at the content edge and is capped", () => {
    expect(labelRooms([{ x: 900, width: 6 }], 1000)).toEqual([83]);
    expect(labelRooms([{ x: 0, width: 6 }], 5000)).toEqual([LABEL_ROOM_MAX]);
    expect(labelRooms([{ x: 960, width: 6 }], 1000)[0]).toBe(0);
    expect(LABEL_ROOM_MIN).toBeGreaterThan(0);
  });

  it("gives a tick after a wide item its room once the wide item has ended", () => {
    expect(labelRooms([{ x: 0, width: 50 }, { x: 60, width: 6 }, { x: 200, width: 6 }], 1000)[1]).toBe(123);
  });
});
