import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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
  ...props
}: ButtonProps) {
  const iconOnly = Boolean(Icon) && !children;
  return (
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
}
