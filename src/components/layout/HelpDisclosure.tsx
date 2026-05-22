import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";

export type HelpDisclosureProps = {
  /** Detailed copy revealed when the disclosure is opened. */
  children: ReactNode;
  /**
   * Visible trigger label. Defaults to "자세히" (details). Keep first-screen
   * labels short; the long explanation lives behind this control.
   */
  label?: string;
  /** Accessible name for the trigger when only the icon shows. */
  ariaLabel?: string;
  /** When true, shows only the help icon (no text label) — for inline hints. */
  iconOnly?: boolean;
  className?: string;
};

/**
 * Collapse long explanations behind a quiet "자세히" / "?" trigger.
 *
 * The copy-diet primitive: first-screen surfaces show a short label, and the
 * reassurance / policy / "how it works" prose moves in here so it is one
 * click away instead of crowding the page. Built on native `<details>` so it
 * needs no state and is keyboard accessible by default.
 */
export function HelpDisclosure({
  children,
  label = "자세히",
  ariaLabel,
  iconOnly = false,
  className = "",
}: HelpDisclosureProps) {
  const classes = ["help-disclosure", iconOnly ? "is-icon-only" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <details className={classes}>
      <summary
        className="help-disclosure-trigger"
        aria-label={ariaLabel ?? (iconOnly ? label : undefined)}
      >
        <HelpCircle size={14} aria-hidden="true" />
        {iconOnly ? null : <span>{label}</span>}
      </summary>
      <div className="help-disclosure-content">{children}</div>
    </details>
  );
}
