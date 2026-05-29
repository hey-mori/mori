import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { InfoHint } from "../../components/ui/InfoHint";
import { Toggle } from "../../components/ui/Toggle";

export type SettingsRailItem = {
  id: string;
  label: string;
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
            <span className="settings-rail-label">{item.label}</span>
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
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" aria-label={title}>
      <header className="settings-section-head">
        <div className="settings-section-heading">
          <h3>{title}</h3>
          {description ? (
            <InfoHint label={`${title} 설명`}>{description}</InfoHint>
          ) : null}
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
  compact = false,
}: {
  label: string;
  description?: string;
  meta?: ReactNode;
  control?: ReactNode;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`settings-row${disabled ? " is-disabled" : ""}${compact ? " is-compact" : ""}`}
    >
      <div className="settings-row-main">
        <strong>{label}</strong>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="settings-row-meta">{meta}</div> : null}
      </div>
      {control ? <div className="settings-row-control">{control}</div> : null}
    </div>
  );
}

export function SettingsOptionGroup({
  label,
  children,
  columns = "auto",
}: {
  label: string;
  children: ReactNode;
  columns?: "auto" | "single";
}) {
  return (
    <div
      className={`settings-option-group columns-${columns}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function SettingsOption({
  selected = false,
  disabled = false,
  planned = false,
  icon: Icon,
  label,
  description,
  meta,
  action,
  onClick,
}: {
  selected?: boolean;
  disabled?: boolean;
  planned?: boolean;
  icon?: LucideIcon;
  label: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick) && !disabled && !planned;
  const className = [
    "settings-option",
    selected ? "is-selected" : "",
    disabled ? "is-disabled" : "",
    planned ? "is-planned" : "",
    clickable ? "is-clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      {Icon ? (
        <span className="settings-option-icon" aria-hidden="true">
          <Icon size={15} />
        </span>
      ) : null}
      <span className="settings-option-main">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
        {meta ? <span className="settings-option-meta">{meta}</span> : null}
      </span>
      {action ? <span className="settings-option-action">{action}</span> : null}
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={selected}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} aria-current={selected ? "true" : undefined}>
      {body}
    </div>
  );
}

export function SettingsProviderOption({
  selected,
  planned,
  icon,
  label,
  description,
  locality,
  dataNotice,
  setup,
  status,
  actions,
  onSelect,
}: {
  selected: boolean;
  planned?: boolean;
  icon: LucideIcon;
  label: string;
  description: string;
  locality: ReactNode;
  dataNotice: string;
  setup: string;
  status: ReactNode;
  actions?: ReactNode;
  onSelect?: () => void;
}) {
  return (
    <SettingsOption
      selected={selected}
      planned={planned}
      icon={icon}
      label={label}
      description={description}
      onClick={onSelect}
      meta={
        <>
          {locality}
          <span>{dataNotice}</span>
          <span>{setup}</span>
        </>
      }
      action={
        <span className="settings-provider-actions">
          {status}
          {actions}
        </span>
      }
    />
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

export function SettingsInlineAction({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`settings-inline-action ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
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

function NoticeBase({
  icon: Icon,
  title,
  tone = "info",
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <aside className={`settings-notice tone-${tone}`}>
      <Icon size={15} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <p>{children}</p>
      </span>
    </aside>
  );
}

export function SettingsNotice(props: {
  icon: LucideIcon;
  title: string;
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return <NoticeBase {...props} />;
}

export function LocalOnlyNotice(props: {
  icon: LucideIcon;
  title: string;
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return <NoticeBase {...props} />;
}
