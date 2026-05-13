import type { ReactNode } from "react";

export function SectionHeader({
  title,
  hint,
  right,
}: {
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="section-header">
      <div>
        <h4>{title}</h4>
        {hint ? <p className="section-header-hint">{hint}</p> : null}
      </div>
      {right ? <div className="section-header-right">{right}</div> : null}
    </header>
  );
}
