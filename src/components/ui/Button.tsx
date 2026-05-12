import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ children, icon: Icon, variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} ${className}`.trim()} type="button" {...props}>
      {Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}
