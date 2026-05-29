import type { HTMLAttributes, ReactNode } from "react";

export type BaseCardVariant = "default" | "subtle" | "accent" | "outline";
export type BaseCardElement = "section" | "article" | "div" | "aside";

export type BaseCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: BaseCardVariant;
  as?: BaseCardElement;
};

/**
 * Generic Mori card surface. Cards across Evidence, Memory, Review, and
 * Reports each hand-rolled the same `border / radius / shadow` rules; this
 * primitive standardises them and routes the values through theme tokens.
 */
export function BaseCard({
  children,
  variant = "default",
  as = "section",
  className = "",
  ...rest
}: BaseCardProps) {
  const merged = `base-card base-card-${variant} ${className}`.trim();
  if (as === "article") return <article className={merged} {...rest}>{children}</article>;
  if (as === "div") return <div className={merged} {...rest}>{children}</div>;
  if (as === "aside") return <aside className={merged} {...rest}>{children}</aside>;
  return <section className={merged} {...rest}>{children}</section>;
}
