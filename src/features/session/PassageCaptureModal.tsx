/**
 * 기록으로 남기기 · the preview between a transcript passage and a record.
 *
 * It answers, before anything is written: what exactly will be kept (the
 * excerpt, verbatim, shown read-only), what record it becomes (type, title,
 * body, project, all editable), and what 저장 does (keeps the excerpt in Mori,
 * where it outlives the agent's transcript). Cancel writes nothing.
 *
 * The excerpt is the source; the fields are the user's reading of it. Editing
 * the body never changes the kept excerpt.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { trapTabKey } from "../../components/ui/focusTrap";
import { useAppStore } from "../../app/store";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { redactText } from "../../lib/connectors/redaction";
import {
  PASSAGE_RECORD_TYPES,
  planPassageCommit,
  quoteExcerpt,
  type PassageDraft,
  type PassageRecordType,
} from "../../lib/capture/passageCapture";
import { contextTreeOrder, inArchivedSubtree } from "../record-ledger/contextTree";
import { commitPassage, loadPassageCaptureContext, type PassageCaptureContext } from "./passageCaptureActions";

const TYPE_LABEL: Record<PassageRecordType, string> = {
  note: "노트",
  decision: "결정",
  task: "할 일",
  knowledge: "지식",
};

const registry = createSchemaRegistry();

export function PassageCaptureModal({
  draft,
  sessionTitle,
  onClose,
}: {
  draft: PassageDraft;
  sessionTitle: string;
  onClose: () => void;
}) {
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const [context, setContext] = useState<PassageCaptureContext | null>(null);
  const [schemaId, setSchemaId] = useState<PassageRecordType>("note");
  const [title, setTitle] = useState(draft.suggestedTitle);
  // The body starts as the quoted excerpt, redacted when the excerpt will be:
  // a likely secret hidden in the kept source must not reappear in the record.
  const prefill = (hide: boolean) => quoteExcerpt(hide ? redactText(draft.excerpt).redacted : draft.excerpt);
  const [body, setBody] = useState(() => prefill(draft.secretLikely));
  const [projectId, setProjectId] = useState<string>("");
  const [redact, setRedact] = useState(draft.secretLikely);
  const [phase, setPhase] = useState<"editing" | "saving" | "failed">("editing");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPassageCaptureContext(draft).then((loaded) => {
      if (cancelled) return;
      setContext(loaded);
      setProjectId(loaded.defaultProjectId ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const projects = useMemo(
    () =>
      context
        ? contextTreeOrder(
            context.contexts.filter(
              (item) => item.type === "project" && !inArchivedSubtree(item.id, context.contexts),
            ),
          )
        : [],
    [context],
  );

  const canSave = phase !== "saving" && title.trim().length > 0 && context !== null;

  const save = async () => {
    if (!canSave) return;
    setPhase("saving");
    try {
      const plan = planPassageCommit(draft, { schemaId, title, body, contextId: projectId || null, redact }, registry);
      const recordId = await commitPassage(plan);
      onClose();
      openRecordInLedger(recordId);
    } catch {
      setPhase("failed");
    }
  };

  return (
    <div className="settings-sheet-layer" role="presentation">
      <div className="settings-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="project-modal passage-capture-modal"
        role="dialog"
        aria-modal="true"
        aria-label="기록으로 남기기"
        tabIndex={-1}
      >
        <header className="settings-sheet-head">
          <div className="settings-sheet-title">
            <strong>기록으로 남기기</strong>
            <InfoHint label="기록으로 남기기 설명">
              아래 구절을 Mori에 그대로 저장하고, 그 구절을 근거로 기록을 만듭니다. 저장한 구절은
              에이전트가 원본 대화를 지워도 남습니다. 대화 전체가 아니라 이 구절만 남깁니다. 기록의
              제목과 내용은 고쳐도 저장한 구절은 바뀌지 않습니다.
            </InfoHint>
          </div>
          <button type="button" className="settings-sheet-close" onClick={onClose} aria-label="닫기">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="project-modal-body">
          {context?.existing ? (
            <p className="passage-capture-existing" role="status">
              이 구절로 만든 기록이 이미 있습니다 ·{" "}
              <button
                type="button"
                className="passage-capture-link"
                onClick={() => {
                  onClose();
                  openRecordInLedger(context.existing!.id);
                }}
              >
                {context.existing.title} 열기
              </button>
            </p>
          ) : null}

          <section className="passage-capture-excerpt" aria-label="저장할 구절">
            <p className="passage-capture-excerpt-head">
              저장할 구절 · {draft.role === "assistant" ? "에이전트" : "나"}
              {draft.partial ? " · 메시지 일부" : ""}
              {sessionTitle ? ` · ${sessionTitle}` : ""}
            </p>
            <blockquote className="passage-capture-quote">{draft.excerpt}</blockquote>
          </section>

          {draft.secretLikely ? (
            <label className="passage-capture-secret">
              <input
                type="checkbox"
                checked={redact}
                onChange={(event) => {
                  const next = event.target.checked;
                  // Follow the choice only while the body is still the prefill.
                  if (body === prefill(redact)) setBody(prefill(next));
                  setRedact(next);
                }}
              />
              비밀 정보로 보이는 부분을 가리고 저장
              <InfoHint label="가리기 설명">
                알려진 형태(키, 토큰, 비밀번호 할당)를 찾아 가립니다. 모든 비밀을 찾는다는 보증은
                아닙니다.
              </InfoHint>
            </label>
          ) : null}

          <div className="passage-capture-types" role="radiogroup" aria-label="기록 종류">
            {PASSAGE_RECORD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={schemaId === type}
                className={schemaId === type ? "passage-capture-type is-selected" : "passage-capture-type"}
                onClick={() => setSchemaId(type)}
              >
                {TYPE_LABEL[type]}
              </button>
            ))}
          </div>

          <label className="project-modal-field">
            <span>
              제목 <em className="is-required">필수</em>
            </span>
            <input style={{ margin: 0 }} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="project-modal-field">
            <span>내용</span>
            <textarea
              className="passage-capture-body"
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>

          <label className="project-modal-field">
            <span>
              프로젝트 <em className="is-optional">선택</em>
            </span>
            <select style={{ margin: 0 }} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">없음</option>
              {projects.map(({ context: project, depth }) => (
                <option key={project.id} value={project.id}>
                  {`${"  ".repeat(depth)}${project.name}`}
                </option>
              ))}
            </select>
          </label>

          {phase === "failed" ? (
            <p className="project-modal-error" role="alert">
              저장하지 못했습니다. 다시 시도해 주세요.
            </p>
          ) : null}
        </div>

        <footer className="project-modal-foot">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
            저장
          </Button>
        </footer>
      </div>
    </div>
  );
}
