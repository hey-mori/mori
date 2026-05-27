import type { ViewKey } from "../../domain/types";
import { moriViewIcon } from "../../components/brand/moriIcons";

/**
 * Primary navigation as pure, testable data.
 *
 * Opening Mori lands on **홈 (home)** and the nav exposes two primary
 * destinations:
 *
 *   홈 (home) · 프로젝트 (workspace)
 *
 * "프로젝트" reuses the existing `workspace` route (the projects→sessions
 * browser) — only the label changed, so deep links and saved state keep
 * working. That page is organised project-first (sessions grouped under their
 * source project, a project-count stat leading), which is what the label
 * names; Mori's *capture* model stays session-centric ("1 conversation = 1
 * session"), but *browsing* happens by project, so the two do not conflict.
 * Drilling into a project opens the per-project overview (ProjectView).
 *
 * The narrower working surfaces (타임라인 / 증거 / 검토 / Flow / 연결 / Mori 노트)
 * stay fully routable but are reached *through* the primary destinations
 * (opening a session from the sidebar routes into Timeline, import is a
 * top-bar action, etc.). **메모리**, **리포트**, and **통합 검토** likewise stay
 * routable but fold into 프로젝트: durable memory lives on each project page,
 * and the memory overview / consolidation review are reached through a
 * project's "메모리 통합" action (or the command palette). Settings is no longer
 * a standing nav entry: it lives behind the top-bar user button as a sheet, so
 * the standing nav stays focused on the two product destinations.
 *
 * Keeping this as data (rather than inline JSX) lets us assert the entry
 * model never regresses — e.g. that 홈 leads, that exactly the three primary
 * destinations appear, and that every key is a routable `ViewKey`.
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
  /** Section label. Omitted for unlabelled groups. */
  label?: string;
  items: NavItem[];
};

/**
 * The canonical nav groups. Order is load-bearing for the entry model — see
 * the module doc comment and the colocated tests.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { key: "home", label: "홈" },
      // "프로젝트" reuses the Workspace projects→sessions browser route — only
      // the label is new. 메모리 folds into it (durable memory per project page).
      { key: "workspace", label: "프로젝트" },
    ],
  },
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
