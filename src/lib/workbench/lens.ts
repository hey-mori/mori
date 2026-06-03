/**
 * The workbench "type lens": one filter applied to every panel at once so
 * several sessions can be scanned for a single signal, all issues, all
 * decisions, all code, instead of reading each panel end to end. "all" passes
 * everything through. Pure logic, kept here so it can be tested without the
 * React view; the icons and toolbar wiring live in the component.
 */

export type Lens = "all" | "issue" | "decision" | "code";

/** Short Korean label per lens, reused by the toolbar and the empty hints. */
export const LENS_LABEL: Record<Lens, string> = {
  all: "전체",
  issue: "이슈",
  decision: "결정",
  code: "코드",
};

/** The minimal event shape the lens needs; the view's event type is wider. */
export interface LensEvent {
  kind: string;
  title: string;
  summary: string;
  actor: string;
}

/** Does an event of `kind` pass the given lens? "all" always passes. */
export function lensMatches(kind: string, lens: Lens): boolean {
  switch (lens) {
    case "all":
      return true;
    case "issue":
      return kind === "issue";
    case "decision":
      return kind === "decision";
    case "code":
      return kind === "fileCode" || kind === "artifact";
  }
}

/**
 * Apply the active lens and the search needle together. The needle is matched
 * case-insensitively over title + summary + actor. Callers pass an already
 * lower-cased, trimmed needle (empty string means "no text filter").
 */
export function filterEvents<T extends LensEvent>(events: T[], needle: string, lens: Lens): T[] {
  let list = events;
  if (lens !== "all") list = list.filter((event) => lensMatches(event.kind, lens));
  if (needle) {
    list = list.filter((event) =>
      `${event.title} ${event.summary} ${event.actor}`.toLowerCase().includes(needle),
    );
  }
  return list;
}

/** Why a filtered panel is empty, worded for whichever filter is active. */
export function emptyFilterLabel(needle: string, lens: Lens): string {
  if (lens !== "all") {
    return needle ? "이 필터에 맞는 항목이 없습니다" : `${LENS_LABEL[lens]} 항목이 없습니다`;
  }
  return "일치하는 항목이 없습니다";
}
