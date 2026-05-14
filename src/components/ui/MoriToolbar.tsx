import type { HTMLAttributes, ReactNode } from "react";

export type MoriToolbarProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Optional aria-label for the toolbar landmark. */
  label?: string;
};

/**
 * Calm horizontal toolbar. Adopters arrange their controls inside; the
 * primitive only handles spacing + the landmark role.
 */
export function MoriToolbar({ children, label, className = "", ...rest }: MoriToolbarProps) {
  return (
    <div
      className={`mori-toolbar ${className}`.trim()}
      role="toolbar"
      aria-label={label}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Spacer that pushes neighbours apart inside a MoriToolbar.
 */
export function MoriToolbarSpacer() {
  return <span className="mori-toolbar-spacer" aria-hidden="true" />;
}
