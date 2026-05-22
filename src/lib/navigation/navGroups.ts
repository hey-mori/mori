import type { ViewKey } from "../../domain/types";
import { moriViewIcon } from "../../components/brand/moriIcons";

/**
 * Sidebar navigation structure as pure, testable data.
 *
 * The entry model is "import-first": Mori reconstructs work from imported
 * evidence, so **연결 (Connections)** — the real import front door — leads the
 * 수집/작업 (capture / work) group. There is no standalone "세션 시작" first
 * action any more; starting a blank session is a *secondary* path that lives
 * at the bottom of the 프로젝트 group under the honest label "새 세션", next to
 * the Workspace session hub it feeds.
 *
 * The group order reads as the product loop: 가져와서 → 검토하고 → 작업하고 →
 * 종합한다 (import → review → work → consolidate), then project-level surfaces,
 * then settings.
 *
 * Keeping this as data (rather than inline JSX in `Sidebar`) lets us assert the
 * entry model never regresses — e.g. that Connections leads, that `start` is
 * never the lone first item, and that every key is a routable `ViewKey`.
 */

/** Keys that have an icon in the shared `moriViewIcon` vocabulary. */
export type NavKey = keyof typeof moriViewIcon;

export type NavItem = {
  key: NavKey;
  label: string;
  /** Static badge text. Live counts are layered on at render time. */
  badge?: string;
};

export type NavGroup = {
  /** Section label. Omitted for the lone settings group. */
  label?: string;
  items: NavItem[];
};

/**
 * The canonical nav groups. Order and grouping are load-bearing for the
 * entry model — see the module doc comment and the colocated tests.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "수집 · 작업",
    items: [
      { key: "connections", label: "연결" },
      { key: "timeline", label: "타임라인" },
      { key: "evidence", label: "증거 허브" },
      { key: "review", label: "검토" },
      { key: "reports", label: "보고서" },
    ],
  },
  {
    label: "프로젝트",
    items: [
      { key: "workspace", label: "워크스페이스" },
      { key: "memory", label: "메모리" },
      { key: "companion", label: "Mori 노트" },
      // Demoted from a standalone top-of-nav action. Creating a blank session
      // is a secondary path that feeds the Workspace session hub, so it sits
      // last in the project group with an honest "새 세션" label.
      { key: "start", label: "새 세션" },
    ],
  },
  { items: [{ key: "settings", label: "설정" }] },
];

/** Every nav key, flattened — handy for routing / coverage assertions. */
export function navKeys(groups: NavGroup[] = NAV_GROUPS): NavKey[] {
  return groups.flatMap((group) => group.items.map((item) => item.key));
}

/** The first navigable surface — the entry the nav points users at first. */
export function navEntryKey(groups: NavGroup[] = NAV_GROUPS): NavKey {
  const first = groups[0]?.items[0]?.key;
  if (!first) throw new Error("NAV_GROUPS must have at least one item");
  return first;
}

/** Find the group label that contains a key (or `undefined` for the key's group label). */
export function navGroupLabelForKey(
  key: ViewKey,
  groups: NavGroup[] = NAV_GROUPS,
): string | undefined {
  return groups.find((group) => group.items.some((item) => item.key === key))?.label;
}
