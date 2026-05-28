import type { ReactNode } from "react";
import { MoriTooltip } from "./MoriTooltip";

/**
 * One option in a `SegmentedControl`.
 *
 * `disabled` options stay visible on purpose — a planned / unavailable
 * segment is shown, not hidden, so the control honestly communicates what
 * the surface will and will not do.
 */
export type SegmentedControlOption<T extends string> = {
  id: T;
  label: ReactNode;
  /** Tooltip copy; also the place to explain why a segment is disabled. */
  title?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[];
  /** The currently-selected option id. */
  value: T;
  /**
   * Selection handler. Omit it for a read-only segmented display (e.g. a
   * control whose only enabled segment is already the current one).
   */
  onChange?: (id: T) => void;
  /** Accessible name for the whole control. */
  ariaLabel: string;
  /**
   * `group` for a set of view toggles, `radiogroup` for a single-select
   * choice. Defaults to `group`.
   */
  role?: "group" | "radiogroup";
};

/**
 * Shared segmented control — the calm, compact "pick one of a few" toggle
 * used by the Timeline toolbar (time range, card density) and the Evidence
 * Quick Pass provider switch.
 *
 * It replaces three hand-rolled `<div className="segmented">` clusters with
 * one typed component, and is backed by the existing `.segmented` rules in
 * the stylesheet so adoption changes no pixels.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  role = "group",
}: SegmentedControlProps<T>) {
  return (
    <div className="segmented" role={role} aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.id === value;
        const button = (
          <button
            key={option.id}
            type="button"
            className={selected ? "active" : ""}
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => {
              if (!option.disabled) onChange?.(option.id);
            }}
          >
            {option.label}
          </button>
        );
        if (!option.title) return button;
        return (
          <MoriTooltip key={option.id} content={option.title} kind="control">
            {button}
          </MoriTooltip>
        );
      })}
    </div>
  );
}
