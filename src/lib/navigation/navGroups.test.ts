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

  it("exposes exactly the three primary destinations", () => {
    expect(navKeys()).toEqual([
      "home",
      "workspace",
      "memory",
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
    // destinations or the top-bar user button (settings / profile). The
    // settings sheet is a modal opened from the user button — it does not
    // appear as a standing nav entry.
    for (const offNav of [
      "connections",
      "session",
      "timeline",
      "evidence",
      "review",
      "start",
      "companion",
      "reports",
      "consolidation",
      "settings",
      "profile",
    ]) {
      expect(keys).not.toContain(offNav);
    }
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
    // Primary destinations live in unlabelled groups, so the helper returns
    // undefined — it must not throw for a present key.
    expect(navGroupLabelForKey("home")).toBeUndefined();
  });

  it("navEntryKey throws on an empty structure", () => {
    expect(() => navEntryKey([] as NavGroup[])).toThrow();
  });
});
