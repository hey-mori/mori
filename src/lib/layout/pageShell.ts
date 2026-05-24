/**
 * Pure layout helpers for the page shell primitives.
 *
 * These keep the small amount of branching logic that drives the shared
 * `PageShell` / `ActionBar` / `NoticeBanner` chrome out of the React
 * components, so the decisions (which max-width token, which class, which
 * tone icon role) are unit-testable without rendering.
 */

/**
 * Content width presets. `full` removes the max-width cap entirely.
 *
 * The names map to product intents, not individual pages:
 * - standard: dashboard/list pages
 * - wide: dense dashboard and project surfaces
 * - detail: split workspaces that need more canvas
 * - reading: text/report surfaces
 */
export type PageShellMaxWidth =
  | "default"
  | "standard"
  | "wide"
  | "detail"
  | "reading"
  | "full";

/**
 * Resolve a content max-width preset to its modifier class. The actual
 * pixel cap lives in CSS (`.page-shell-content.is-*`) so the values can be
 * tuned from one place.
 */
export function resolvePageShellMaxWidthClass(
  maxWidth: PageShellMaxWidth = "standard",
): string {
  switch (maxWidth) {
    case "reading":
      return "is-reading";
    case "wide":
      return "is-wide";
    case "detail":
      return "is-detail";
    case "full":
      return "is-full";
    case "standard":
    case "default":
    default:
      return "is-standard";
  }
}

/**
 * Whether a shell layout reserves a right rail (aside). A shell with an
 * aside switches the content grid to two columns; without one it stays a
 * single readable column. Kept pure so the column decision is testable.
 */
export function pageShellHasAside(aside: unknown): boolean {
  return aside != null && aside !== false;
}

/** Notice banner tones — semantic, never the brand purple. */
export type NoticeTone = "info" | "success" | "warning" | "danger";

/**
 * Map a notice tone to its modifier class. Tones are semantic (info = blue,
 * success = green, warning = amber, danger = red) per the brand colour
 * contract — purple is reserved for identity, not status.
 */
export function resolveNoticeToneClass(tone: NoticeTone = "info"): string {
  return `notice-banner-${tone}`;
}

/**
 * Map an ARIA live-region role for a notice tone. Warnings and dangers are
 * assertive alerts; info / success are polite status updates.
 */
export function resolveNoticeRole(tone: NoticeTone = "info"): "status" | "alert" {
  return tone === "warning" || tone === "danger" ? "alert" : "status";
}
