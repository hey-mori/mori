import type { HTMLAttributes, ReactNode } from "react";

export type MoriCardVariant = "default" | "subtle" | "accent" | "outline";
export type MoriCardElement = "section" | "article" | "div" | "aside";

export type MoriCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: MoriCardVariant;
  as?: MoriCardElement;
};

/**
 * Generic Mori card surface. Cards across Evidence, Memory, Review, and
 * Reports each hand-rolled the same `border / radius / shadow` rules; this
 * primitive standardises them and routes the values through theme tokens.
 */
export function MoriCard({
  children,
  variant = "default",
  as = "section",
  className = "",
  ...rest
}: MoriCardProps) {
  const merged = `mori-card mori-card-${variant} ${className}`.trim();
  if (as === "article") return <article className={merged} {...rest}>{children}</article>;
  if (as === "div") return <div className={merged} {...rest}>{children}</div>;
  if (as === "aside") return <aside className={merged} {...rest}>{children}</aside>;
  return <section className={merged} {...rest}>{children}</section>;
}
