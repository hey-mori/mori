/**
 * 원본 보관 · keep a point-in-time copy of this session's transcript in Mori.
 *
 * The agent deletes its transcripts after a while (Claude Code: 30 days by
 * default). This is the one deliberate way to keep a whole session readable
 * and searchable after that; it is never done for the user. The dialog says,
 * before anything is copied: what is kept, how large it is, what it may
 * contain, where it goes, what it is not, and how to remove it.
 */
import { useEffect, useRef, useState } from "react";
import { Archive, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { trapTabKey } from "../../components/ui/focusTrap";
import { selectRetainedSourceKind, useSessionStore } from "../../app/sessionStore";
import { loadAutoImportMeta } from "../../lib/session/autoImportMetaStore";
import { formatArchiveBytes, type KeptArchive } from "../../lib/session/sessionArchive";
import { estimateCleanup, type CleanupPolicyInput } from "../../lib/session/retentionRisk";
import { keepSessionArchive, loadKeptArchive, removeSessionArchive } from "./sessionArchiveActions";
import { loadCleanupPolicy } from "./retentionActions";
import { keepEach, totalBytes } from "../../lib/session/keepEach";

function day(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export function SessionArchiveControl({ sessionId }: { sessionId: string }) {
  const meta = loadAutoImportMeta(sessionId);
  const [kept, setKept] = useState<KeptArchive | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<"keep" | "remove" | null>(null);
  const [policy, setPolicy] = useState<CleanupPolicyInput | null>(null);
  // Known gone, or replaced by another conversation, this open: there is
  // nothing of this session left to keep a copy of.
  const sourceNotThis = useSessionStore((state) => {
    if (selectRetainedSourceKind(state) !== null) return true;
    // A placeholder with nothing imported shows the read failure instead.
    const window = state.sessionWindow;
    return (
      window?.sessionId === sessionId &&
      window.status === "error" &&
      (window.error.kind === "missing" || window.error.kind === "archiveMissing" || window.error.kind === "archiveDamaged")
    );
  });

  useEffect(() => {
    let cancelled = false;
    void loadCleanupPolicy().then((next) => {
      if (!cancelled) setPolicy(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void loadKeptArchive(sessionId)
      .then((found) => {
        if (!cancelled) setKept(found);
      })
      .catch(() => {
        if (!cancelled) setKept(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Only a Claude Code transcript has a reader that can open a kept copy.
  if (!meta || meta.importKind !== "claude-code" || !meta.sourceFilePath || !loaded) return null;
  if (!kept && sourceNotThis) return null;

  // Only an estimate near or past says anything; otherwise the chip stays plain.
  const cleanup = policy ? estimateCleanup(meta.modifiedAt ?? meta.updatedAt, policy, Date.now()) : null;
  const near = cleanup?.state === "approaching" || cleanup?.state === "mayBeEligible";
  const grown = Boolean(kept && meta.fileBytes !== undefined && kept.locator.bytes < meta.fileBytes);
  const note = !kept && near ? (cleanup?.state === "mayBeEligible" ? "정리 대상일 수 있음" : "곧 정리될 수 있음") : grown ? "이후 대화 있음" : null;

  return (
    <>
      {kept ? (
        <button type="button" className="session-archive-chip" onClick={() => setDialog("remove")}>
          <Archive size={12} aria-hidden="true" />
          보관함 · {day(kept.source.capturedAt)} · {formatArchiveBytes(kept.locator.bytes)}
          {note ? <span className="session-archive-chip-note"> · {note}</span> : null}
        </button>
      ) : (
        <button type="button" className="session-archive-chip" onClick={() => setDialog("keep")}>
          <Archive size={12} aria-hidden="true" />
          원본 보관
          {note ? <span className="session-archive-chip-note"> · {note}</span> : null}
        </button>
      )}
      {dialog === "keep" ? (
        <KeepDialog
          sizeBytes={meta.fileBytes}
          onClose={() => setDialog(null)}
          onKeep={async () => {
            const result = await keepSessionArchive(sessionId, meta.sourceFilePath);
            setKept(result);
          }}
        />
      ) : null}
      {dialog === "remove" && kept ? (
        <RemoveDialog
          kept={kept}
          onClose={() => setDialog(null)}
          onRemove={async () => {
            await removeSessionArchive(kept);
            setKept(null);
          }}
        />
      ) : null}
    </>
  );
}

function useModal(onClose: () => void, busy: () => boolean, fallbackFocus?: () => HTMLElement | null) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read through refs so a re-render (a phase change) never re-runs the effect
  // and bounces focus out of the dialog and back.
  const latest = useRef({ onClose, busy, fallbackFocus });
  latest.current = { onClose, busy, fallbackFocus };
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!latest.current.busy()) latest.current.onClose();
        return;
      }
      trapTabKey(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      // The control that opened it may be gone (a pick bar emptied by the
      // keep): focus then goes back inside the dialog beneath, never to body.
      if (previous?.isConnected) previous.focus();
      else latest.current.fallbackFocus?.()?.focus();
    };
  }, []);
  return dialogRef;
}

export function KeepDialog({
  title,
  sizeBytes,
  onClose,
  onKeep,
}: {
  /** Names the conversation when the dialog opens away from it. */
  title?: string;
  sizeBytes?: number;
  onClose: () => void;
  onKeep: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<"asking" | "keeping" | "kept" | "failed">("asking");
  const busy = useRef(false);
  const ref = useModal(onClose, () => busy.current);
  const keep = async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("keeping");
    try {
      await onKeep();
      setPhase("kept");
    } catch {
      setPhase("failed");
    } finally {
      busy.current = false;
    }
  };
  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={() => !busy.current && onClose()} aria-hidden="true" />
      <div ref={ref} className="project-modal session-archive-modal" role="dialog" aria-modal="true" aria-label="원본 보관" tabIndex={-1}>
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong>원본 보관</strong>
          </div>
          <button type="button" className="settings-sheet-close" onClick={() => !busy.current && onClose()} aria-label="닫기">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="project-modal-body">
          {phase === "kept" ? (
            <p className="session-archive-done" role="status">
              보관했습니다. 원본 대화가 지워져도 Mori에서 이 세션을 열고 찾을 수 있습니다.
            </p>
          ) : (
            <>
              <p className="session-archive-lead">
                {title ? `「${title}」의` : "이 세션의"} 원본 대화를 지금 시점 그대로 Mori에 보관합니다.
              </p>
              <KeepFacts sizeBytes={sizeBytes} />
            </>
          )}
          {phase === "failed" ? (
            <p className="project-modal-error" role="alert">
              보관하지 못했습니다. 원본이 없거나 저장 공간이 부족할 수 있습니다.
            </p>
          ) : null}
        </div>
        <footer className="project-modal-foot">
          {phase === "kept" ? (
            <Button variant="primary" onClick={onClose}>
              닫기
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={phase === "keeping"} onClick={onClose}>
                취소
              </Button>
              <Button variant="primary" disabled={phase === "keeping"} onClick={() => void keep()}>
                {phase === "keeping" ? "보관하는 중…" : "보관"}
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function RemoveDialog({ kept, onClose, onRemove }: { kept: KeptArchive; onClose: () => void; onRemove: () => Promise<void> }) {
  const [phase, setPhase] = useState<"asking" | "removing" | "failed">("asking");
  const busy = useRef(false);
  const ref = useModal(onClose, () => busy.current);
  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("removing");
    try {
      await onRemove();
      busy.current = false;
      onClose();
    } catch {
      busy.current = false;
      setPhase("failed");
    }
  };
  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={() => !busy.current && onClose()} aria-hidden="true" />
      <div ref={ref} className="project-modal session-archive-modal" role="dialog" aria-modal="true" aria-label="보관한 원본" tabIndex={-1}>
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong>보관한 원본</strong>
            <InfoHint label="보관한 원본 설명">
              {day(kept.source.capturedAt)} 시점의 사본입니다. 원본 대화가 지워지면 Mori는 이 사본을 대신 엽니다.
            </InfoHint>
          </div>
          <button type="button" className="settings-sheet-close" onClick={() => !busy.current && onClose()} aria-label="닫기">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="project-modal-body">
          <p className="session-archive-lead">
            {day(kept.source.capturedAt)}에 보관한 {formatArchiveBytes(kept.locator.bytes)} 사본을 지울까요? 에이전트의 원본에는
            영향이 없지만, 원본이 이미 지워졌다면 이 사본으로는 더 이상 열 수 없습니다(전에 가져온 기록이 있으면 그것만 남습니다). 이
            대화에서 남긴 기록과 저장한 구절은 그대로입니다.
          </p>
          {phase === "failed" ? (
            <p className="project-modal-error" role="alert">
              지우지 못했습니다.
            </p>
          ) : null}
        </div>
        <footer className="project-modal-foot">
          <Button variant="ghost" disabled={phase === "removing"} onClick={onClose}>
            닫기
          </Button>
          <Button variant="secondary" disabled={phase === "removing"} onClick={() => void remove()}>
            보관한 원본 지우기
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** What keeping an original means, said the same way for one or several. */
export function KeepFacts({ sizeBytes }: { sizeBytes?: number }) {
  return (
    <ul className="session-archive-facts">
      <li>크기: {sizeBytes ? `약 ${formatArchiveBytes(sizeBytes)}` : "보관할 때 확인합니다"}</li>
      <li>
        담기는 것: 메시지, 붙여 넣거나 읽은 이미지, 도구 실행과 그 결과 전부. 도구가 읽거나 출력한
        비밀번호, 키, 내부 주소가 그대로 들어 있을 수 있습니다.
      </li>
      <li>담기지 않는 것: 하위 에이전트 대화, 따로 저장된 큰 도구 결과 파일, 보관 뒤에 이어진 대화</li>
      <li>보관 위치: Mori 저장 폴더 안 (archives). 따로 백업되지는 않습니다.</li>
      <li>원본이 지워진 뒤에도 Mori에서 열고 찾을 수 있습니다. 에이전트가 이어서 쓸 수 있는 세션은 아닙니다.</li>
      <li>언제든 지울 수 있고, 지워도 에이전트의 원본에는 영향이 없습니다.</li>
    </ul>
  );
}

/**
 * Keep several originals the user chose, in one confirmed step. Each is kept
 * in turn; one that fails is named and the rest are still kept.
 */
export function KeepManyDialog({
  items: chosen,
  onClose,
  onKeep,
  onDone,
  fallbackFocus,
}: {
  items: ReadonlyArray<{ sessionId: string; title: string; sizeBytes?: number }>;
  onClose: () => void;
  onKeep: (sessionId: string) => Promise<unknown>;
  /** Once every keep has run, with the ones that failed. */
  onDone?: (failed: string[]) => void;
  fallbackFocus?: () => HTMLElement | null;
}) {
  // What the user confirmed, fixed when the dialog opens: a reload behind it
  // (a kept conversation leaving the list) must not change what it reports.
  const [items] = useState(chosen);
  const [phase, setPhase] = useState<"asking" | "keeping" | "done">("asking");
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const busy = useRef(false);
  const ref = useModal(onClose, () => busy.current, fallbackFocus);
  const total = totalBytes(items.map((item) => item.sizeBytes));
  const keep = async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("keeping");
    try {
      const outcomes = await keepEach(
        items.map((item) => item.sessionId),
        onKeep,
        (done) => setProgress(done),
      );
      const failedIds = outcomes.filter((outcome) => !outcome.kept).map((outcome) => outcome.sessionId);
      setFailed(failedIds);
      onDone?.(failedIds);
    } finally {
      busy.current = false;
      setPhase("done");
    }
  };
  const titleOf = (sessionId: string) => items.find((item) => item.sessionId === sessionId)?.title ?? sessionId;
  const keptCount = items.length - failed.length;
  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={() => !busy.current && onClose()} aria-hidden="true" />
      <div ref={ref} className="project-modal session-archive-modal" role="dialog" aria-modal="true" aria-label="원본 보관" tabIndex={-1}>
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong>원본 {items.length}개 보관</strong>
          </div>
          <button type="button" className="settings-sheet-close" onClick={() => !busy.current && onClose()} aria-label="닫기">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="project-modal-body">
          {phase === "done" ? (
            <>
              <p className="session-archive-done" role="status">
                {keptCount > 0 ? `${keptCount}개를 보관했습니다.` : "보관하지 못했습니다."}
                {failed.length > 0 ? ` ${failed.length}개는 보관하지 못했습니다. 원본이 없거나 저장 공간이 부족할 수 있습니다.` : ""}
              </p>
              {failed.length > 0 ? (
                <ul className="session-archive-facts">
                  {failed.map((sessionId) => (
                    <li key={sessionId}>{titleOf(sessionId)}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              <p className="session-archive-lead">고른 대화 {items.length}개의 원본을 지금 시점 그대로 Mori에 보관합니다.</p>
              <KeepFacts sizeBytes={total} />
            </>
          )}
        </div>
        <footer className="project-modal-foot">
          {phase === "done" ? (
            <Button variant="primary" onClick={onClose}>
              닫기
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={phase === "keeping"} onClick={onClose}>
                취소
              </Button>
              <Button variant="primary" disabled={phase === "keeping"} onClick={() => void keep()}>
                {phase === "keeping" ? `보관하는 중… ${progress}/${items.length}` : `${items.length}개 보관`}
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
