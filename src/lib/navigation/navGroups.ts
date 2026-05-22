import type { ViewKey } from "../../domain/types";
import { moriViewIcon } from "../../components/brand/moriIcons";

/**
 * Sidebar navigation structure as pure, testable data.
 *
 * The IA is **session-centric**: opening Mori lands on **홈 (home)** — a
 * one-glance view of "my work memory" — and the sidebar exposes only the four
 * primary destinations a user navigates between:
 *
 *   홈 (home) · 세션 (workspace) · 메모리 (memory) · 설정 (settings)
 *
 * "세션" reuses the existing `workspace` route (the session hub) — only the
 * label changed, so deep links and saved state keep working. The narrower
 * working surfaces that used to crowd the nav (타임라인 / 증거 / 검토 / Flow /
 * 연결 / Mori 노트) stay fully routable — they are reached *through* the primary
 * destinations (e.g. opening a session routes into Timeline, import is an
 * action on 홈 / 세션) rather than as standing nav entries. **리포트 (reports)**
 * and **통합 검토 (consolidation)** likewise stay routable but fold *into*
 * 메모리 — Reports is the terminal output step of the memory loop, so it is
 * reached through Memory rather than as its own destination.
 *
 * Keeping this as data (rather than inline JSX in `Sidebar`) lets us assert the
 * entry model never regresses — e.g. that 홈 leads, that exactly the five
 * primary destinations appear, and that every key is a routable `ViewKey`.
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
    items: [
      { key: "home", label: "홈" },
      // "세션" reuses the Workspace session-hub route — only the label is new.
      { key: "workspace", label: "세션" },
      { key: "memory", label: "메모리" },
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
