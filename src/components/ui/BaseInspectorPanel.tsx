import { ChevronRight, X } from "lucide-react";
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

/* ── Inspector content kit ───────────────────────────────────────────────────
 * A small set of primitives for composing an inspector body. Every panel
 * (event, bundle, source, review) builds from these so the right rail reads as
 * ONE design system: consistent section rhythm, card treatment, label/value
 * fields, clickable list rows, expand-in-place disclosure, action clusters, and
 * quiet notes. Larger drill-downs open a BaseDrawer; this kit covers everything
 * that stays inside the rail.
 * ───────────────────────────────────────────────────────────────────────── */

/** A titled block. `hint` is a quiet count/aside next to the title; `action` is
 *  a control pinned to the title's right (a select, a small button). With no
 *  title it is just a spacing group. */
export function InspectorSection({
  title,
  hint,
  action,
  children,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ins-section">
      {title || action ? (
        <div className="ins-section-head">
          <div className="ins-section-headings">
            {title ? <h4 className="ins-section-title">{title}</h4> : null}
            {hint ? <span className="ins-section-hint">{hint}</span> : null}
          </div>
          {action ? <div className="ins-section-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A bordered content box. `label` renders an uppercase kicker; `action` pins a
 *  control (e.g. a disclosure-level toggle) to the label's right. `tone="accent"`
 *  tints it for the one block that should lead the eye. */
export function InspectorCard({
  label,
  action,
  tone = "default",
  children,
}: {
  label?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "accent";
  children: ReactNode;
}) {
  return (
    <div className={`ins-card${tone === "accent" ? " is-accent" : ""}`}>
      {label || action ? (
        <div className="ins-card-head">
          {label ? <span className="ins-card-label">{label}</span> : null}
          {action ? <div className="ins-card-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** A two-column label/value metadata grid (dt/dd). Values can opt into a
 *  monospace treatment for paths / IDs. */
export function InspectorFields({
  items,
}: {
  items: Array<{ label: ReactNode; value: ReactNode; mono?: boolean }>;
}) {
  return (
    <dl className="ins-fields">
      {items.map((item, index) => (
        <div key={index} className="ins-field">
          <dt>{item.label}</dt>
          <dd className={item.mono ? "is-mono" : undefined}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A list container for InspectorRow children. */
export function InspectorRows({ children }: { children: ReactNode }) {
  return <ul className="ins-rows">{children}</ul>;
}

/** One row: optional leading glyph, a title + meta stack, optional trailing
 *  node. When `onClick` is set the whole row is a button. */
export function InspectorRow({
  leading,
  title,
  meta,
  trailing,
  onClick,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      {leading ? <span className="ins-row-leading">{leading}</span> : null}
      <span className="ins-row-main">
        <span className="ins-row-title">{title}</span>
        {meta ? <span className="ins-row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="ins-row-trailing">{trailing}</span> : null}
    </>
  );
  return (
    <li className={`ins-row${onClick ? " is-clickable" : ""}`}>
      {onClick ? (
        <button type="button" className="ins-row-btn" onClick={onClick}>
          {inner}
        </button>
      ) : (
        <div className="ins-row-static">{inner}</div>
      )}
    </li>
  );
}

/** Expand-in-place disclosure for secondary detail (read-only files, the long
 *  tail of a list). Uses native <details> so it is keyboard- and SSR-safe. */
export function InspectorDisclosure({
  summary,
  count,
  defaultOpen = false,
  children,
}: {
  summary: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="ins-disclosure" open={defaultOpen}>
      <summary className="ins-disclosure-summary">
        <ChevronRight size={13} className="ins-disclosure-chevron" aria-hidden="true" />
        <span>{summary}</span>
        {typeof count === "number" ? (
          <span className="ins-disclosure-count">{count}</span>
        ) : null}
      </summary>
      <div className="ins-disclosure-body">{children}</div>
    </details>
  );
}

/** A horizontal cluster of action buttons. Wraps on narrow rails. */
export function InspectorActions({ children }: { children: ReactNode }) {
  return <div className="ins-actions">{children}</div>;
}

/** A quiet one-or-two-line note with an optional leading icon (privacy, hint). */
export function InspectorNote({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className="ins-note">
      {icon ? (
        <span className="ins-note-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </p>
  );
}

/** The empty-state line for a section with nothing to show. */
export function InspectorEmpty({ children }: { children: ReactNode }) {
  return <p className="ins-empty">{children}</p>;
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
