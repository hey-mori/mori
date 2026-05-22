import { describe, expect, it } from "vitest";
import { moriViewIcon } from "../../components/brand/moriIcons";
import {
  NAV_GROUPS,
  navEntryKey,
  navGroupLabelForKey,
  navKeys,
  type NavGroup,
} from "./navGroups";

describe("NAV_GROUPS entry model", () => {
  it("leads with Connections as the import front door, not a standalone start action", () => {
    expect(navEntryKey()).toBe("connections");
    // The very first group must not be a lone `start` item the way the old
    // nav put "세션 시작" at the top.
    expect(NAV_GROUPS[0]?.items[0]?.key).not.toBe("start");
  });

  it("keeps the start view reachable as a demoted secondary path", () => {
    const keys = navKeys();
    expect(keys).toContain("start");
    // It is not the entry, and it lives in the 프로젝트 group beside Workspace.
    expect(keys[0]).not.toBe("start");
    expect(navGroupLabelForKey("start")).toBe("프로젝트");
  });

  it("relabels the start action away from recording / 세션 시작 framing", () => {
    const startItem = NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.key === "start",
    );
    expect(startItem?.label).toBe("새 세션");
  });

  it("orders the work group as import → review → work → synthesise", () => {
    const workGroup = NAV_GROUPS.find((group) => group.label === "수집 · 작업");
    expect(workGroup?.items.map((item) => item.key)).toEqual([
      "connections",
      "timeline",
      "evidence",
      "review",
      "reports",
    ]);
  });

  it("places Workspace first in the project group as the session hub", () => {
    const projectGroup = NAV_GROUPS.find((group) => group.label === "프로젝트");
    expect(projectGroup?.items[0]?.key).toBe("workspace");
  });

  it("keeps settings as the lone trailing unlabelled group", () => {
    const last = NAV_GROUPS[NAV_GROUPS.length - 1];
    expect(last?.label).toBeUndefined();
    expect(last?.items.map((item) => item.key)).toEqual(["settings"]);
  });

  it("only references keys that have a shared icon", () => {
    for (const key of navKeys()) {
      expect(moriViewIcon[key]).toBeDefined();
    }
  });

  it("has no duplicate keys across groups", () => {
    const keys = navKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("navEntryKey throws on an empty structure", () => {
    expect(() => navEntryKey([] as NavGroup[])).toThrow();
  });
});
