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
  it("leads with 홈 (home) as the session-centric landing surface", () => {
    expect(navEntryKey()).toBe("home");
    expect(NAV_GROUPS[0]?.items[0]?.key).toBe("home");
  });

  it("exposes exactly the four primary destinations", () => {
    expect(navKeys()).toEqual([
      "home",
      "workspace",
      "memory",
      "settings",
    ]);
  });

  it("reuses the workspace route for the 세션 label", () => {
    const sessionItem = NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.key === "workspace",
    );
    expect(sessionItem?.label).toBe("세션");
  });

  it("drops the narrower working surfaces from the standing nav", () => {
    const keys = navKeys();
    // These remain routable ViewKeys, just reached *through* the primary
    // destinations rather than as standing nav entries. "session" is the
    // unified Session Detail workspace — opened from 세션 (workspace), never a
    // standing nav entry of its own. "reports" and "consolidation" fold into
    // 메모리 — routable, but reached through Memory, not the standing nav.
    for (const offNav of ["connections", "session", "timeline", "evidence", "review", "start", "companion", "reports", "consolidation"]) {
      expect(keys).not.toContain(offNav);
    }
  });

  it("keeps settings as the lone trailing group", () => {
    const last = NAV_GROUPS[NAV_GROUPS.length - 1];
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

  it("navGroupLabelForKey resolves a key's group label", () => {
    // Primary destinations now live in unlabelled groups, so the helper
    // returns undefined — it must not throw for a present key.
    expect(navGroupLabelForKey("home")).toBeUndefined();
  });

  it("navEntryKey throws on an empty structure", () => {
    expect(() => navEntryKey([] as NavGroup[])).toThrow();
  });
});
