import type { ReactNode } from "react";
import {
  pageShellHasAside,
  resolvePageShellMaxWidthClass,
  type PageShellMaxWidth,
} from "../../lib/layout/pageShell";

export type PageShellProps = {
  /**
   * Optional `PageHeader` element. Pinned to the top; content scrolls beneath
   * it. Headerless surfaces (the sidebar already names the destination) omit
   * it and rely on the `actionBar` alone for a thin pinned top band.
   */
  header?: ReactNode;
  /** Optional row directly under the header — usually an `ActionBar`. */
  actionBar?: ReactNode;
  /** Main scrollable content. */
  children: ReactNode;
  /** Optional right rail (inspector / detail panel). */
  aside?: ReactNode;
  /** Content width preset. Ignored when an `aside` is present. */
  maxWidth?: PageShellMaxWidth;
  /** Extra class on the outer shell, for the rare per-feature override. */
  className?: string;
};

/**
 * The consistent outer shell every page sits inside.
 *
 * It owns the things each view used to hand-roll differently: the page
 * padding, the content max-width, the header band, and — crucially — the
 * scroll boundary. The header (and an optional action bar) stay pinned; only
 * the content column scrolls, so the shared chrome never drifts as content
 * grows. When an `aside` is supplied the content area becomes a two-column
 * grid that reuses the `--mori-rail` width and the inspector's responsive
 * collapse, so right rails behave identically across screens.
 */
export function PageShell({
  header,
  actionBar,
  children,
  aside,
  maxWidth = "default",
  className = "",
}: PageShellProps) {
  const hasAside = pageShellHasAside(aside);
  const widthClass = hasAside ? "is-full" : resolvePageShellMaxWidthClass(maxWidth);
  // A surface can drop the title band entirely (the sidebar already names the
  // destination). The pinned top band still renders for the action bar; when
  // neither header nor action bar is supplied we skip the band so headerless
  // content surfaces flush to the top.
  const hasTop = Boolean(header) || Boolean(actionBar);
  const classes = [
    "page-shell",
    hasAside ? "has-aside" : "",
    header ? "" : "is-headerless",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      {hasTop ? (
        <div className="page-shell-top">
          {header}
          {actionBar}
        </div>
      ) : null}
      <div className="page-shell-scroll mori-scroll">
        <div className={`page-shell-content ${widthClass}`}>
          {hasAside ? (
            <div className="page-shell-split">
              <div className="page-shell-main">{children}</div>
              {aside}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
