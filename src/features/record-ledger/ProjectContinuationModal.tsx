/**
 * 이어가기 · preview and copy a project's continuation pack (#144).
 *
 * The preview IS the output: the text shown is exactly the text copied, so the
 * user reviews what leaves Mori before it leaves. What was left out is stated
 * inside that text, as counts only, so the receiving agent knows it too. Shape is the house modal (`ProjectCreateModal`'s
 * scrim, headed bar, round close, Esc, focus trap), widened for a document.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { trapTabKey } from "../../components/ui/focusTrap";
import type { ProjectContinuationPack } from "../../lib/continuation/projectContinuation";

type CopyState = "idle" | "copied" | "failed";

export function ProjectContinuationModal({
  pack,
  onClose,
}: {
  pack: ProjectContinuationPack;
  onClose: () => void;
}) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      trapTabKey(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const copyPack = async () => {
    try {
      await navigator.clipboard.writeText(pack.markdown);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="project-modal continuation-modal"
        role="dialog"
        aria-modal="true"
        aria-label="프로젝트 이어가기"
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong>이어가기</strong>
            <InfoHint label="이어가기 설명">
              다음 AI 세션에 붙여 넣을 이 프로젝트의 맥락입니다. 확정된 기록만 담고, 각 항목은
              출처 기록을 가리킵니다. 노트 본문과 에이전트 요청 원문은 넣지 않습니다. 비밀
              정보로 보이는 항목은 통째로 뺍니다. 다만 이 검사는 알려진 형태를 찾는 보호
              장치일 뿐, 비밀이 없다는 보증은 아닙니다.
            </InfoHint>
          </div>
          <button type="button" className="settings-sheet-close" onClick={onClose} aria-label="닫기">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="project-modal-body">
          <pre className="continuation-preview" aria-label="복사될 내용">
            {pack.markdown}
          </pre>
        </div>

        <footer className="project-modal-foot">
          <span className="continuation-copy-state" role="status" aria-live="polite">
            {copy === "copied" ? "복사했습니다" : copy === "failed" ? "복사하지 못했습니다" : ""}
          </span>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={() => void copyPack()}>
            복사
          </Button>
        </footer>
      </div>
    </div>
  );
}
