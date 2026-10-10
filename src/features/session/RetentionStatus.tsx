/**
 * 정리될 수 있는 대화 · a quiet count on Home, only when a source conversation
 * may soon be removed by the agent's own cleanup and Mori does not keep it
 * whole. Opening it lists those conversations with the one deliberate way to
 * keep each (원본 보관). Nothing is kept unless the user chooses to.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { trapTabKey } from "../../components/ui/focusTrap";
import { isClaudeBridgeAvailable } from "../../lib/claude/claudeTauri";
import { formatArchiveBytes } from "../../lib/session/sessionArchive";
import {
  cleanupPhrase,
  keptPhrase,
  retentionAttention,
  type RetentionAssessment,
} from "../../lib/session/retentionRisk";
import { KeepDialog, KeepManyDialog } from "./SessionArchiveControl";
import { totalBytes } from "../../lib/session/keepEach";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { keepSessionArchive } from "./sessionArchiveActions";
import { loadRetentionView, type RetentionView } from "./retentionActions";
import { useSessionTitle } from "../../app/useDisclosedView";

export function RetentionStatus({
  onOpen,
  refreshKey,
}: {
  onOpen: (sessionId: string) => void;
  /** Changes when the registered sessions change (a discovery pass landed). */
  refreshKey?: number;
}) {
  const [view, setView] = useState<RetentionView | null>(null);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const run = ++seq.current;
    void loadRetentionView()
      .then((next) => {
        if (run === seq.current) setView(next);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isClaudeBridgeAvailable()) return;
    reload();
    return () => {
      seq.current += 1;
    };
  }, [reload, refreshKey]);

  const attention = view ? retentionAttention(view.assessments) : [];
  if (!view || (attention.length === 0 && !open)) return null;

  return (
    <>
      {attention.length > 0 ? (
        <button
          type="button"
          className="mcs-retention"
          onClick={() => {
            setOpen(true);
            reload();
          }}
        >
          정리될 수 있는 대화 {attention.length}개
        </button>
      ) : null}
      {open
        ? // Out of the status row: its backdrop filter would contain a fixed
          // layer, and its button styles would reach the dialog's buttons.
          createPortal(
            <RetentionDialog
              view={view}
              attention={attention}
              onClose={() => setOpen(false)}
              onOpen={(sessionId) => {
                setOpen(false);
                onOpen(sessionId);
              }}
              onKept={reload}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function RetentionDialog({
  view,
  attention,
  onClose,
  onOpen,
  onKept,
}: {
  view: RetentionView;
  attention: RetentionAssessment[];
  onClose: () => void;
  onOpen: (sessionId: string) => void;
  onKept: () => void;
}) {
  const shownTitle = useSessionTitle();
  const titleOf = (a: RetentionAssessment) => shownTitle(a.title, a.titleFromRequest);
  const [keeping, setKeeping] = useState<RetentionAssessment | null>(null);
  // Conversations the user picked to keep together; only those with a found
  // original can be picked.
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [keepingMany, setKeepingMany] = useState(false);
  const pickable = attention.filter((a) => Boolean(a.sourcePath));
  const pickedItems = pickable.filter((a) => picked.has(a.sessionId));
  const togglePick = (sessionId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, subDialogOpen: false });
  latest.current = { onClose, subDialogOpen: keeping !== null || keepingMany };
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      // The keep dialog on top handles its own keys.
      if (latest.current.subDialogOpen) return;
      if (event.key === "Escape") {
        latest.current.onClose();
        return;
      }
      trapTabKey(event, ref.current);
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  const lost = view.assessments.filter((a) => a.lost);
  const period = view.policy.periodDays;
  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className="project-modal session-archive-modal"
        role="dialog"
        aria-modal="true"
        aria-label="정리될 수 있는 대화"
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong>정리될 수 있는 대화</strong>
            <InfoHint label="정리 시점 설명">
              Claude Code는 마지막 변경 뒤 {period ?? 30}일이 지난 대화 기록을 지웁니다
              {view.policy.source === "unset" ? "(설정이 없어 기본값으로 계산)" : ""}. 날짜는 파일 시각으로 계산한
              추정이고, 프로젝트별 설정이나 정리가 실제로 도는 시점에 따라 달라질 수 있습니다.
              보관은 Mori 저장 폴더 안의 사본이며 백업이 아닙니다. Mori는 직접 고르기 전에는
              아무것도 보관하지 않습니다.
            </InfoHint>
          </div>
          <button
            type="button"
            className="settings-sheet-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="project-modal-body">
          {attention.length === 0 ? (
            <p className="session-archive-lead" role="status">
              곧 정리될 대화가 없습니다.
            </p>
          ) : (
            <ul className="retention-list">
              {attention.map((a) => (
                <li key={a.sessionId} className="retention-row">
                  {a.sourcePath ? (
                    <input
                      type="checkbox"
                      className="retention-row-pick"
                      checked={picked.has(a.sessionId)}
                      onChange={() => togglePick(a.sessionId)}
                      aria-label={`${titleOf(a)} 보관할 대화로 고르기`}
                    />
                  ) : null}
                  <div className="retention-row-text">
                    <strong>{titleOf(a)}</strong>
                    <span>
                      {cleanupPhrase(a.cleanup)} · {keptPhrase(a)}
                      {a.bytes ? ` · ${formatArchiveBytes(a.bytes)}` : ""}
                    </span>
                    {decisionSignals(a) ? <span className="retention-row-signals">{decisionSignals(a)}</span> : null}
                  </div>
                  <div className="retention-row-actions">
                    <Button variant="ghost" size="sm" onClick={() => onOpen(a.sessionId)}>
                      열기
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setKeeping(a)}>
                      보관
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pickedItems.length > 0 ? (
            <div className="retention-pick-bar">
              <span>
                고른 대화 {pickedItems.length}개
                {totalBytes(pickedItems.map((item) => item.bytes)) !== undefined
                  ? ` · 약 ${formatArchiveBytes(totalBytes(pickedItems.map((item) => item.bytes))!)}`
                  : ""}
              </span>
              <Button variant="primary" size="sm" onClick={() => setKeepingMany(true)}>
                {pickedItems.length}개 보관
              </Button>
            </div>
          ) : null}
          {lost.length > 0 ? (
            <details className="retention-lost">
              <summary>원본을 찾을 수 없는 대화 {lost.length}개</summary>
              <ul className="retention-list">
                {lost.map((a) => (
                  <li key={a.sessionId} className="retention-row">
                    <div className="retention-row-text">
                      <strong>{titleOf(a)}</strong>
                      <span>{keptPhrase(a)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
      {keepingMany ? (
        <KeepManyDialog
          items={pickedItems.map((item) => ({ sessionId: item.sessionId, title: titleOf(item), sizeBytes: item.bytes }))}
          onClose={() => {
            setKeepingMany(false);
            setPicked(new Set());
            onKept();
          }}
          onKeep={async (sessionId) => {
            const item = pickedItems.find((candidate) => candidate.sessionId === sessionId);
            if (!item?.sourcePath) throw new Error("no source path");
            await keepSessionArchive(item.sessionId, item.sourcePath);
          }}
        />
      ) : null}
      {keeping ? (
        <KeepDialog
          title={titleOf(keeping)}
          sizeBytes={keeping.bytes}
          onClose={() => {
            setKeeping(null);
            onKept();
          }}
          onKeep={async () => {
            if (!keeping.sourcePath) throw new Error("no source path");
            await keepSessionArchive(keeping.sessionId, keeping.sourcePath);
          }}
        />
      ) : null}
    </div>
  );
}

/** What helps decide, as observed: where it ran, how long, PRs it names. */
function decisionSignals(a: RetentionAssessment): string {
  return [
    a.projectLabel ? shortProjectLabel(a.projectLabel) : null,
    a.messageCount ? `메시지 ${a.messageCount}개` : null,
    a.prCount ? `PR ${a.prCount}개` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
