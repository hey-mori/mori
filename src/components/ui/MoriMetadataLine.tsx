import type { ReactNode } from "react";

export type MoriMetadataLineProps = {
  items: Array<ReactNode | false | null | undefined>;
  className?: string;
  /** Keep metadata on one line when the surrounding row is very dense. */
  truncate?: boolean;
};

/**
 * Compact metadata line for object rows and dense panels.
 *
 * It owns the separator dots, wrapping/truncation, and muted hierarchy so
 * sessions, sources, memories, reports, and settings rows do not each rebuild
 * the same "label · label · chip" pattern.
 */
export function MoriMetadataLine({
  items,
  className = "",
  truncate = false,
}: MoriMetadataLineProps) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <span
      className={[
        "mori-metadata-line",
        truncate ? "is-truncated" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {visible.map((item, index) => (
        <span className="mori-metadata-item" key={index}>
          {item}
        </span>
      ))}
    </span>
  );
}
