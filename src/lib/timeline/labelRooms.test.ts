import { describe, expect, it } from "vitest";
import { LABEL_ROOM_MAX, LABEL_ROOM_MIN, labelRooms, labelSides } from "./collisionLayout";

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

describe("a title on the left when the right has no room", () => {
  it("prints the last tick's title to its left, in space no earlier label uses", () => {
    // A lone tick at the content edge.
    expect(labelSides([{ x: 990, width: 6 }], 0, 1000)).toEqual({ right: [0], left: [LABEL_ROOM_MAX] });
    // After a tick whose right label stops short (capped), the rest is free.
    const sides = labelSides([{ x: 100, width: 6 }, { x: 990, width: 6 }], 0, 1000);
    expect(sides.right[0]).toBe(LABEL_ROOM_MAX);
    expect(sides.left[1]).toBe(LABEL_ROOM_MAX);
  });

  it("shares the gap when the previous title would fill it, and never overlaps", () => {
    const placements = [{ x: 800, width: 6 }, { x: 990, width: 6 }];
    const sides = labelSides(placements, 0, 1000);
    const half = Math.floor((990 - 806 - 2 * 5 - 6) / 2);
    expect(sides.right[0]).toBe(half);
    expect(sides.left[1]).toBe(half);
    // prev label end + gap <= this label start
    expect(806 + 5 + sides.right[0]! + 6).toBeLessThanOrEqual(990 - 5 - sides.left[1]!);
  });

  it("gives nothing when the gap is too small, or a wide item covers the tick", () => {
    expect(labelSides([{ x: 960, width: 6 }, { x: 990, width: 6 }], 0, 1000).left[1]).toBe(0);
    expect(labelSides([{ x: 900, width: 95 }, { x: 990, width: 6 }], 0, 1000).left[1]).toBe(0);
  });

  it("lets only items that print a label claim or share room", () => {
    // A wide card crowded by its successor never takes half of a real label.
    const crowded = labelSides(
      [{ x: 300, width: 6 }, { x: 420, width: 180, printsLabel: false }, { x: 605, width: 6 }],
      0,
      1000,
    );
    expect(crowded.right[0]).toBe(420 - 306 - 5 - 6);
    expect(crowded.left[1]).toBe(0);
    // A wide predecessor's unused right room does not block the last tick.
    const wide = labelSides([{ x: 700, width: 200, printsLabel: false }, { x: 990, width: 6 }], 0, 1000);
    expect(wide.right[0]).toBe(0);
    expect(wide.left[1]).toBe(990 - 900 - 6 - 5);
  });

  it("leaves an item with room on its right alone", () => {
    expect(labelSides([{ x: 100, width: 6 }, { x: 200, width: 6 }], 0, 1000).left).toEqual([0, 0]);
  });
});
