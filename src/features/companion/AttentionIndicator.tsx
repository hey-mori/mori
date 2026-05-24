import { useEffect, useRef, useState } from "react";
import { ArrowRight, Compass } from "lucide-react";
import { useMoriAppStore } from "../../app/store";
import type { ViewKey } from "../../domain/types";
import {
  companionSeverityTone,
  describeCompanionBasis,
} from "../../lib/companion/companionSignals";
import type {
  MoriNotification,
  MoriNotificationActionTarget,
} from "../../lib/notifications/notification";
import type { ReviewSelection } from "../../lib/review-workspace/reviewWorkspace";
import { useMoriNotifications } from "./useMoriNotifications";

/**
 * Mori 노트 — the global notifications panel anchored to the sidebar foot.
 *
 * The panel renders `MoriNotification[]` from `useMoriNotifications()`, the
 * producer-neutral hook. Today the only producer is the Companion layer
 * (adapted via `companionSignalToNotification`); future producers (an
 * import-finished pulse, a memory-stale detector, a package-export ping)
 * fan into the same hook and flow through this surface unchanged.
 *
 * Honesty rules carried from the Companion layer:
 *   - Zero notifications → indicator is quiet (no badge, muted colour).
 *   - Demo mode → footer copy distinguishes derived-from-demo from real.
 *   - Notifications surface only what is already imported and reviewed.
 */

const PANEL_LIMIT = 4;

export function AttentionIndicator({
  onNavigate,
  compact = false,
}: {
  onNavigate: (view: ViewKey) => void;
  /** When true, the indicator renders as an icon-only quick-action button
   *  (sidebar head) with a small count badge. Otherwise it shows the full
   *  "Mori 노트" pill with label + badge (sidebar foot / legacy). */
  compact?: boolean;
}) {
  const { notifications, isDemo } = useMoriNotifications();
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const count = notifications.length;
  const visible = notifications.slice(0, PANEL_LIMIT);
  const hasMore = notifications.length > PANEL_LIMIT;

  // Close on Escape, and trap focus briefly so keyboard users can navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function dispatchTarget(target: MoriNotificationActionTarget): void {
    setOpen(false);
    if (!target) return;
    if (target.kind === "view") onNavigate(target.view);
    else if (target.kind === "review") openReviewItem(target.selection);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`attention-indicator${count > 0 ? " has-signals" : ""}${compact ? " is-compact" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count > 0 ? `Mori 노트 — 알림 ${count}건` : "Mori 노트"}
        title={
          count > 0
            ? `Mori 노트 — 살펴볼 알림 ${count}건`
            : "Mori 노트 — 이번 세션에서 살펴볼 것"
        }
      >
        <span className="attention-indicator-icon" aria-hidden="true">
          <Compass size={compact ? 15 : 16} />
        </span>
        {compact ? null : <span className="attention-indicator-label">Mori 노트</span>}
        {count > 0 ? (
          <span
            className="attention-indicator-badge"
            aria-hidden={compact ? "true" : undefined}
            aria-label={compact ? undefined : `${count}개 알림`}
          >
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Transparent scrim — closes the panel on click-outside. */}
          <div
            className="attention-panel-scrim"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="attention-panel"
            role="dialog"
            aria-label="Mori 노트"
            aria-modal="false"
            tabIndex={-1}
          >
            <header className="attention-panel-head">
              <span className="attention-panel-icon" aria-hidden="true">
                <Compass size={14} />
              </span>
              <div className="attention-panel-titles">
                <h3>Mori 노트</h3>
                <p>이번 세션에서 살펴볼 것</p>
              </div>
              {count > 0 ? (
                <span className="attention-panel-count">{count}</span>
              ) : null}
            </header>

            <div className="attention-panel-body">
              {visible.length === 0 ? (
                <p className="attention-panel-empty">
                  지금은 특별히 살펴볼 것이 없습니다. 새 소스를 가져오거나
                  Quick Pass를 실행하면 다시 짚어 드립니다.
                </p>
              ) : (
                <ul className="attention-panel-signals">
                  {visible.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onDispatch={dispatchTarget}
                    />
                  ))}
                </ul>
              )}
            </div>

            <footer className="attention-panel-foot">
              <button
                type="button"
                className="attention-panel-viewall"
                onClick={() => {
                  setOpen(false);
                  onNavigate("companion");
                }}
              >
                {hasMore ? `전체 ${count}개 노트 보기` : "전체 노트 보기"}
                <ArrowRight size={11} aria-hidden="true" />
              </button>
              <p className="attention-panel-privacy">
                {isDemo
                  ? "데모 데이터 기준입니다."
                  : "가져온 소스에서만 생성됩니다. 자동으로 쓰지 않습니다."}
              </p>
            </footer>
          </div>
        </>
      ) : null}
    </>
  );
}

// ─── Notification row ─────────────────────────────────────────────────────────

/** Maps a notification basis label without re-importing the Companion type. */
function describeBasis(basis: MoriNotification["basis"]): string {
  return describeCompanionBasis(basis);
}

function NotificationRow({
  notification,
  onDispatch,
}: {
  notification: MoriNotification;
  onDispatch: (target: MoriNotificationActionTarget) => void;
}) {
  const target = notification.actionTarget;
  // The renderer never inspects which producer raised the row — it dispatches
  // on the producer-neutral target shape.
  const action = target ? () => onDispatch(target) : null;
  return (
    <li>
      <button
        type="button"
        className="attention-signal"
        data-mori-tone={companionSeverityTone(notification.severity)}
        onClick={action ?? undefined}
        disabled={!action}
        title={`${notification.title} — ${describeBasis(notification.basis)}`}
      >
        <span className="companion-signal-dot" aria-hidden="true" />
        <div className="attention-signal-body">
          <strong className="attention-signal-title">{notification.title}</strong>
          <p>{notification.message}</p>
        </div>
        {action ? (
          <ArrowRight
            size={13}
            aria-hidden="true"
            className="attention-signal-arrow"
          />
        ) : null}
      </button>
    </li>
  );
}

/** Re-exported so callers that imported the type from this module keep working. */
export type { MoriNotification, ReviewSelection };
