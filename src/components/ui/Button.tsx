import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BaseTooltip } from "./BaseTooltip";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function Button({
  children,
  icon: Icon,
  variant = "secondary",
  size = "md",
  className = "",
  title,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) {
  const iconOnly = Boolean(Icon) && !children;
  const tooltip = iconOnly ? title : undefined;
  const resolvedAriaLabel = ariaLabel ?? (iconOnly && typeof title === "string" ? title : undefined);
  const button = (
    <button
      className={[
        "btn",
        `btn-${variant}`,
        `btn-${size}`,
        iconOnly ? "btn-icon-only" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      type="button"
      {...props}
      aria-label={resolvedAriaLabel}
    >
      {Icon ? <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
  if (!tooltip) return button;
  return (
    <BaseTooltip content={tooltip} kind="control">
      {button}
    </BaseTooltip>
  );
}
