import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  resolveNoticeRole,
  resolveNoticeToneClass,
  type NoticeTone,
} from "../../lib/layout/pageShell";

export type NoticeBannerProps = {
  tone?: NoticeTone;
  /** Optional bold lead-in. */
  title?: ReactNode;
  /** Body copy / message. */
  children: ReactNode;
  /** Right-aligned action slot (buttons). */
  actions?: ReactNode;
  /** When provided, renders a dismiss control wired to this handler. */
  onDismiss?: () => void;
  /** Override the default tone icon. Pass `null` to hide it. */
  icon?: LucideIcon | null;
  className?: string;
};

const TONE_ICON: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

/**
 * One consistent info / success / warning / danger banner. Tones are
 * semantic (info = blue, success = green, warning = amber, danger = red) —
 * never the brand purple. Replaces the per-feature `connections-status`,
 * `review-applied-banner`, ad-hoc privacy notes, etc.
 */
export function NoticeBanner({
  tone = "info",
  title,
  children,
  actions,
  onDismiss,
  icon,
  className = "",
}: NoticeBannerProps) {
  const Icon = icon === null ? null : icon ?? TONE_ICON[tone];
  const classes = ["notice-banner", resolveNoticeToneClass(tone), className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role={resolveNoticeRole(tone)}>
      {Icon ? (
        <span className="notice-banner-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
      ) : null}
      <div className="notice-banner-body">
        {title ? <strong className="notice-banner-title">{title}</strong> : null}
        <span className="notice-banner-copy">{children}</span>
      </div>
      {actions ? <div className="notice-banner-actions">{actions}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          className="notice-banner-dismiss"
          onClick={onDismiss}
          aria-label="배너 닫기"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
