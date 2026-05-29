import type { HTMLAttributes, ReactNode } from "react";

export type BaseToolbarProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Optional aria-label for the toolbar landmark. */
  label?: string;
};

/**
 * Calm horizontal toolbar. Adopters arrange their controls inside; the
 * primitive only handles spacing + the landmark role.
 */
export function BaseToolbar({ children, label, className = "", ...rest }: BaseToolbarProps) {
  return (
    <div
      className={`base-toolbar ${className}`.trim()}
      role="toolbar"
      aria-label={label}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Spacer that pushes neighbours apart inside a BaseToolbar.
 */
export function BaseToolbarSpacer() {
  return <span className="base-toolbar-spacer" aria-hidden="true" />;
}
