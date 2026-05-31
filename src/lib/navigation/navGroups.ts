import type { ViewKey } from "../../domain/types";
import { viewIcon } from "../../components/brand/moriIcons";

/**
 * Primary navigation as pure, testable data.
 *
 * The standing navigation follows the four-axis model documented in
 * `docs/design/home-dashboard-workbench-direction.md`:
 *
 *   홈 (time) · 연동 (input) · 프로젝트 (project list/detail) ·
 *   대시보드 (analysis) · 워크벤치 (session canvas)
 *
 * Narrower surfaces such as Session Detail, Project Detail, Memory, Reports,
 * and Settings remain routable, but they are reached through one of these
 * surfaces or through the command palette. Retiring a surface from standing
 * navigation does not mean deleting its component or route.
 */

/** Keys that have an icon in the shared `viewIcon` vocabulary. */
export type NavKey = keyof typeof viewIcon;

export type NavItem = {
  key: NavKey;
  label: string;
  /** Static badge text. Live counts are layered on at render time. */
  badge?: string;
};

export type NavGroup = {
  /** Section label. Omitted for unlabelled groups. */
  label?: string;
  items: NavItem[];
};

/**
 * The canonical nav groups. Order is load-bearing for the entry model.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { key: "home", label: "홈" },
      { key: "connections", label: "연동" },
      { key: "workspace", label: "프로젝트" },
      { key: "dashboard", label: "대시보드" },
      { key: "workbench", label: "워크벤치" },
    ],
  },
];

/** Every nav key, flattened: handy for routing / coverage assertions. */
export function navKeys(groups: NavGroup[] = NAV_GROUPS): NavKey[] {
  return groups.flatMap((group) => group.items.map((item) => item.key));
}

/** The first navigable surface: the entry the nav points users at first. */
export function navEntryKey(groups: NavGroup[] = NAV_GROUPS): NavKey {
  const first = groups[0]?.items[0]?.key;
  if (!first) throw new Error("NAV_GROUPS must have at least one item");
  return first;
}

/** Find the group label that contains a key, if that group is labelled. */
export function navGroupLabelForKey(
  key: ViewKey,
  groups: NavGroup[] = NAV_GROUPS,
): string | undefined {
  return groups.find((group) => group.items.some((item) => item.key === key))?.label;
}
