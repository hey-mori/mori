import type { KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Toggle } from "../../components/ui/Toggle";

export type SettingsRailItem = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  disabled?: boolean;
};

export function SettingsRail({
  items,
  activeId,
  onSelect,
}: {
  items: SettingsRailItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const enabled = items.filter((item) => !item.disabled);
    const current = enabled.findIndex((item) => item.id === activeId);
    let next = -1;
    if (event.key === "ArrowDown") next = (current + 1) % enabled.length;
    else if (event.key === "ArrowUp") next = (current - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    if (next === -1) return;
    event.preventDefault();
    const nextItem = enabled[next];
    if (!nextItem) return;
    onSelect(nextItem.id);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-settings-rail-id="${nextItem.id}"]`)
        ?.focus();
    });
  }

  return (
    <nav className="settings-rail" aria-label="설정 카테고리" onKeyDown={handleKeyDown}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={`settings-rail-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            disabled={item.disabled}
            data-settings-rail-id={item.id}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
            {item.badge ? <Badge tone="gray">{item.badge}</Badge> : null}
          </button>
        );
      })}
    </nav>
  );
}

export function SettingsSection({
  title,
  description,
  eyebrow,
  action,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" aria-label={title}>
      <header className="settings-section-head">
        <div>
          {eyebrow ? <span className="settings-section-eyebrow">{eyebrow}</span> : null}
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="settings-section-action">{action}</div> : null}
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  meta,
  control,
  disabled = false,
}: {
  label: string;
  description?: string;
  meta?: ReactNode;
  control?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`settings-row${disabled ? " is-disabled" : ""}`}>
      <div className="settings-row-main">
        <strong>{label}</strong>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="settings-row-meta">{meta}</div> : null}
      </div>
      {control ? <div className="settings-row-control">{control}</div> : null}
    </div>
  );
}

export function SettingsCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`settings-inline-card ${className}`.trim()}>{children}</div>;
}

export function StatusPill({
  tone = "gray",
  children,
}: {
  tone?: "green" | "blue" | "purple" | "gray" | "orange" | "red";
  children: ReactNode;
}) {
  return <span className={`settings-status-pill tone-${tone}`}>{children}</span>;
}

export function PreferenceToggle({
  label,
  active,
  disabled,
  onToggle,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <span className={disabled ? "preference-toggle is-disabled" : "preference-toggle"}>
      <Toggle active={active} label={label} onClick={disabled ? undefined : onToggle} />
    </span>
  );
}

export function LocalOnlyNotice({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="local-only-notice">
      <Icon size={15} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <p>{children}</p>
      </span>
    </aside>
  );
}
