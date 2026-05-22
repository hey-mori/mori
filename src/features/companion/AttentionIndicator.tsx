import { useEffect, useRef, useState } from "react";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useMoriAppStore } from "../../app/store";
import type { ViewKey } from "../../domain/types";
import {
  companionSeverityTone,
  describeCompanionBasis,
  getCompanionSignalActionTarget,
  type CompanionSignal,
} from "../../lib/companion/companionSignals";
import type { ReviewSelection } from "../../lib/review-workspace/reviewWorkspace";
import { useCompanionSignals } from "./useCompanionSignals";

/**
 * Global Attention Layer (P4).
 *
 * A persistent indicator in the sidebar that shows how many Mori notes
 * the current session has generated. Clicking it opens a compact popover
 * panel with the top few signals, framed around what the user *gains* from
 * acting — not a raw "N개 검토 후보" badge.
 *
 * The panel is a supplementary quick-access surface; the full Companion
 * Inbox (`companion` view) remains the detailed, organised destination.
 *
 * Honesty rules:
 *   - Zero signals → indicator is quiet (no badge, muted colour).
 *   - Demo mode → shown but clearly labelled as demo data.
 *   - Signals come from `useCompanionSignals` — the same hook as the
 *     CompanionCard / CompanionInbox, so the count is always consistent.
 */

const PANEL_SIGNAL_LIMIT = 4;

export function AttentionIndicator({
  onNavigate,
}: {
  onNavigate: (view: ViewKey) => void;
}) {
  const { feed, isDemo } = useCompanionSignals();
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const count = feed.length;
  const panelSignals = feed.slice(0, PANEL_SIGNAL_LIMIT);
  const hasMore = feed.length > PANEL_SIGNAL_LIMIT;

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

  function handleNavigate(view: ViewKey) {
    setOpen(false);
    onNavigate(view);
  }

  function handleReviewItem(selection: ReviewSelection) {
    setOpen(false);
    openReviewItem(selection);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`attention-indicator${count > 0 ? " has-signals" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Mori 노트 — 이번 세션에서 살펴볼 것"
      >
        <span className="attention-indicator-icon" aria-hidden="true">
          <Compass size={16} />
        </span>
        <span className="attention-indicator-label">Mori 노트</span>
        {count > 0 ? (
          <span
            className="attention-indicator-badge"
            aria-label={`${count}개 신호`}
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
              {panelSignals.length === 0 ? (
                <p className="attention-panel-empty">
                  지금은 특별히 살펴볼 것이 없습니다. 새 소스를 가져오거나
                  Quick Pass를 실행하면 Mori가 다시 짚어 드립니다.
                </p>
              ) : (
                <ul className="attention-panel-signals">
                  {panelSignals.map((signal) => (
                    <AttentionSignalRow
                      key={signal.id}
                      signal={signal}
                      onNavigate={handleNavigate}
                      onOpenReviewItem={handleReviewItem}
                    />
                  ))}
                </ul>
              )}
            </div>

            <footer className="attention-panel-foot">
              <button
                type="button"
                className="attention-panel-viewall"
                onClick={() => handleNavigate("companion")}
              >
                {hasMore
                  ? `전체 ${count}개 노트 보기`
                  : "전체 노트 보기"}
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

// ─── Signal row ───────────────────────────────────────────────────────────────

function AttentionSignalRow({
  signal,
  onNavigate,
  onOpenReviewItem,
}: {
  signal: CompanionSignal;
  onNavigate: (view: ViewKey) => void;
  onOpenReviewItem: (selection: ReviewSelection) => void;
}) {
  const target = getCompanionSignalActionTarget(signal);
  const action =
    target?.kind === "review"
      ? () => onOpenReviewItem(target.selection)
      : target?.kind === "view"
        ? () => onNavigate(target.view)
        : null;

  return (
    <li
      className="attention-signal"
      data-mori-tone={companionSeverityTone(signal.severity)}
    >
      <span className="companion-signal-dot" aria-hidden="true" />
      <div className="attention-signal-body">
        <div className="attention-signal-head">
          <strong>{signal.title}</strong>
          <span
            className={`companion-signal-basis basis-${signal.basis}`}
          >
            {describeCompanionBasis(signal.basis)}
          </span>
        </div>
        <p>{signal.message}</p>
      </div>
      {action ? (
        <Button onClick={action}>{signal.actionLabel}</Button>
      ) : null}
    </li>
  );
}
