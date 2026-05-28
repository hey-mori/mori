import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MoriTooltip } from "./MoriTooltip";

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
  ...props
}: ButtonProps) {
  const iconOnly = Boolean(Icon) && !children;
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
    >
      {Icon ? <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
  if (!title) return button;
  return (
    <MoriTooltip content={title} kind="control">
      {button}
    </MoriTooltip>
  );
}
