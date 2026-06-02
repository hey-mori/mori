import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Children, Fragment, isValidElement } from "react";

export type BaseInspectorPanelProps = {
  /**
   * Eyebrow row of badges / chips above the title. Duplicate visible labels are
   * collapsed (so a 대화 / 대화 / 대화 trio renders as a single "대화" chip).
   */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One-line meta under the title (e.g. time range, status). */
  meta?: ReactNode;
  /** Optional longer description after the meta row. */
  description?: ReactNode;
  /** Close handler. When provided, an X button renders top-right. */
  onClose?: () => void;
  /** Section body. */
  children: ReactNode;
  /** Extra class on the outer aside. */
  className?: string;
  ariaLabel?: string;
};

/**
 * Inspector panel — the unified right-rail surface used by 흐름 (timeline) and
 * 자료 (evidence) tabs to render contextual detail for a selected item. Owns:
 *
 *   - a sticky header with an eyebrow badge row, title, meta, optional
 *     description, and a flush top-right X close button
 *   - a scrollable body for sections
 *   - 100 % height of its grid cell so the panel reads as a real side surface,
 *     not a half-height card floating in whitespace
 *
 * Eyebrow badges are deduped by their visible text label so panels that get
 * fed lane + activity + type chips with overlapping vocab (e.g. 대화 × 3)
 * collapse to a single chip per distinct label.
 */
export function BaseInspectorPanel({
  eyebrow,
  title,
  meta,
  description,
  onClose,
  children,
  className,
  ariaLabel,
}: BaseInspectorPanelProps) {
  const eyebrowItems = dedupeBadges(eyebrow);
  const classes = ["base-inspector-panel", className].filter(Boolean).join(" ");
  return (
    <aside className={classes} aria-label={ariaLabel}>
      <header className="base-inspector-panel-head">
        {onClose ? (
          <button
            type="button"
            className="base-inspector-panel-close"
            onClick={onClose}
            aria-label="패널 닫기"
          >
            <X size={15} aria-hidden="true" />
          </button>
        ) : null}
        {eyebrowItems.length ? (
          <div className="base-inspector-panel-eyebrow">{eyebrowItems}</div>
        ) : null}
        <h3 className="base-inspector-panel-title">{title}</h3>
        {meta ? <p className="base-inspector-panel-meta">{meta}</p> : null}
        {description ? (
          <p className="base-inspector-panel-description">{description}</p>
        ) : null}
      </header>
      <div className="base-inspector-panel-body">{children}</div>
    </aside>
  );
}

function dedupeBadges(eyebrow: ReactNode): ReactNode[] {
  if (!eyebrow) return [];
  const flat = flattenChildren(eyebrow);
  const out: ReactNode[] = [];
  const seen = new Set<string>();
  flat.forEach((child, idx) => {
    if (child === null || child === undefined || child === false || child === true) return;
    const key = extractTextKey(child);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(
      <span key={`eyebrow-${idx}`} className="base-inspector-panel-eyebrow-item">
        {child}
      </span>,
    );
  });
  return out;
}

/**
 * Walk a ReactNode tree and yield the leaf-level renderable children,
 * unwrapping React.Fragment wrappers (which Children.forEach treats as a
 * single element, collapsing N badges into one chip). Real element children
 * (Badge, etc.) come through as-is.
 */
function flattenChildren(node: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  Children.forEach(node, (child) => {
    if (isValidElement(child) && child.type === Fragment) {
      out.push(
        ...flattenChildren((child.props as { children?: ReactNode }).children),
      );
      return;
    }
    out.push(child);
  });
  return out;
}

function extractTextKey(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node).trim().toLowerCase();
  }
  if (isValidElement(node)) {
    const child = (node.props as { children?: ReactNode }).children;
    if (typeof child === "string" || typeof child === "number") {
      return String(child).trim().toLowerCase();
    }
    if (Array.isArray(child)) {
      return child
        .map((part) => extractTextKey(part as ReactNode))
        .filter(Boolean)
        .join("|");
    }
  }
  return "";
}
