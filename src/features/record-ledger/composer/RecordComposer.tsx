/**
 * RecordComposer · the capture entry of the 기록 workspace
 * (docs/design/record-workspace/interaction-and-state-spec.md).
 *
 * A six-state machine, not a textarea with a button: free text (or a
 * schema quick form) → 정리 → candidate review → save, with the raw source
 * persisted at 정리 time and a local draft guarding the typing phase. The
 * review presents Mori's interpretation per candidate (type · date with its
 * 근거 · context) and every correction becomes a user revision on top of the
 * AI's create revision.
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import { ArrowLeft, Check, FileText, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import {
  classifyCaptureSignal,
  lowSignalReasonLabel,
  proposeRecords,
  type FormEntry,
} from "../../../lib/capture";
import type { SchemaDefinition } from "../../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "../useRecordLedger";
import { clearComposerDraft, loadComposerDraft, saveComposerDraft } from "./composerDraft";
import {
  composerInitial,
  composerReduce,
  keptRecordIds,
  type CandidateEdit,
  type ComposerError,
  type ComposerState,
} from "./composerMachine";
import { CandidateCard } from "./CandidateCard";
import { SchemaQuickForm } from "./SchemaQuickForm";

/** Quick-form chips: recently used schema ids, workout/note as the default. */
const RECENT_SCHEMAS_KEY = "mori.record-composer.recent-schemas";
const DEFAULT_RECENT = ["workout", "note"];

function loadRecentSchemas(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SCHEMAS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.slice(0, 3) : DEFAULT_RECENT;
  } catch {
    return DEFAULT_RECENT;
  }
}

function rememberSchema(schemaId: string): void {
  try {
    const next = [schemaId, ...loadRecentSchemas().filter((id) => id !== schemaId)].slice(0, 3);
    window.localStorage.setItem(RECENT_SCHEMAS_KEY, JSON.stringify(next));
  } catch {
    // Chips are a convenience; storage failures must not break capture.
  }
}

function classifyError(error: unknown): ComposerError {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch|network|connect|ECONNREFUSED/i.test(message)) {
    return { kind: "engine-missing", message: "분석 엔진에 연결할 수 없어요" };
  }
  if (/parse|json|invalid/i.test(message)) {
    return { kind: "parse", message: "정리 결과를 읽지 못했어요" };
  }
  return { kind: "unknown", message: "정리 중 문제가 생겼어요" };
}

export function RecordComposer({
  ledger,
  onSaved,
}: {
  ledger: RecordLedger;
  /** Reports the ids just committed (or [] on undo) so the workspace can
   *  highlight their placement in the timeline. */
  onSaved?: (savedRecordIds: string[]) => void;
}) {
  const [state, dispatch] = useReducer(
    composerReduce,
    null,
    (): ComposerState => composerInitial(loadComposerDraft()?.text ?? null),
  );
  // null = 자동 감지; a schema id opens the quick form for that schema.
  const [formSchemaId, setFormSchemaId] = useState<string | null>(null);
  const [recentSchemas, setRecentSchemas] = useState<string[]>(loadRecentSchemas);

  // The typing draft is the recovery copy (approved 5.1): a local, transient
  // safeguard, removed on save or clear, never a kernel object.
  useEffect(() => {
    if (state.phase === "typing") saveComposerDraft(state.text);
    if (state.phase === "idle") clearComposerDraft();
  }, [state]);

  // Live detection hint while typing: the pure proposer is cheap, so the
  // user sees what 정리 would find before pressing it.
  const detectionHint = useMemo(() => {
    if (state.phase !== "typing" || state.text.trim().length < 4) return null;
    try {
      const proposals = proposeRecords({ kind: "text", content: state.text });
      if (proposals.length === 0) return null;
      const counts = new Map<string, number>();
      for (const proposal of proposals) {
        const name = ledger.registry.get(proposal.schemaId)?.name ?? proposal.schemaId;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([name, count]) => (count > 1 ? `${name} ${count}` : name))
        .join(" · ");
    } catch {
      return null;
    }
  }, [state, ledger.registry]);

  const organize = async (text: string) => {
    dispatch({ type: "ORGANIZE" });
    try {
      const outcome = await ledger.proposeCapture({ kind: "text", content: text });
      dispatch({ type: "ORGANIZED", outcome });
    } catch (error) {
      dispatch({ type: "ORGANIZE_FAILED", error: classifyError(error) });
    }
  };

  const submitForm = async (
    schema: SchemaDefinition,
    values: FormEntry["values"],
    text: string,
    occurredStart?: string,
  ) => {
    rememberSchema(schema.id);
    setRecentSchemas(loadRecentSchemas());
    setFormSchemaId(null);
    // Drive the machine through the same states as free text so the review
    // and save semantics are identical for both entry paths.
    dispatch({ type: "TYPE", text: text.trim().length > 0 ? text : schema.name });
    dispatch({ type: "ORGANIZE" });
    try {
      const outcome = await ledger.proposeFormCapture({ schema, values, text, occurredStart });
      dispatch({ type: "ORGANIZED", outcome });
    } catch (error) {
      dispatch({ type: "ORGANIZE_FAILED", error: classifyError(error) });
    }
  };

  const save = async (sourceOnly: boolean) => {
    if (state.phase !== "reviewing" || state.saving) return;
    const { outcome, edits, excluded } = state;
    dispatch({ type: "SAVE_START" });
    try {
      const result = await ledger.commitCapture(
        outcome,
        sourceOnly ? { sourceOnly: true } : { edits, excludeRecordIds: excluded },
      );
      clearComposerDraft();
      dispatch({ type: "SAVED", savedRecordIds: result.savedRecordIds });
      onSaved?.(result.savedRecordIds);
    } catch (error) {
      dispatch({ type: "SAVE_FAILED", error: classifyError(error) });
    }
  };

  const undo = async () => {
    if (state.phase !== "saved" || state.undone) return;
    await ledger.discardRecords(state.savedRecordIds);
    dispatch({ type: "UNDONE" });
    onSaved?.([]);
  };

  /** 직접 정리 from the failed state: save the text as one faithful note.
   *  Pilot simplification: this creates its own source alongside the one the
   *  failed 정리 preserved; deduping the two is an R3 follow-up. */
  const manualNote = async () => {
    if (state.phase !== "failed") return;
    const text = state.text;
    const noteSchema = ledger.registry.get("note");
    if (!noteSchema) return;
    const outcome = await ledger.proposeFormCapture({ schema: noteSchema, values: {}, text });
    await ledger.commitCapture(outcome);
    clearComposerDraft();
    dispatch({ type: "CLEAR" });
  };

  // ---- idle / typing ------------------------------------------------------
  if (state.phase === "idle" || state.phase === "typing" || state.phase === "organizing") {
    const text = state.phase === "idle" ? "" : state.text;
    const busy = state.phase === "organizing";
    const formSchema = formSchemaId ? (ledger.registry.get(formSchemaId) ?? null) : null;

    return (
      <section className="composer" aria-label="빠른 기록">
        {state.phase === "idle" && state.restoredDraft ? (
          <div className="composer-restore" role="status">
            작성 중이던 내용이 있어요
            <span className="composer-restore-actions">
              <button type="button" onClick={() => dispatch({ type: "RESTORE_ACCEPT" })}>
                이어서 쓰기
              </button>
              <button
                type="button"
                onClick={() => {
                  clearComposerDraft();
                  dispatch({ type: "RESTORE_DISMISS" });
                }}
              >
                지우기
              </button>
            </span>
          </div>
        ) : null}

        {formSchema ? (
          <SchemaQuickForm
            schema={formSchema}
            onSubmit={(values, freeText, occurredStart) =>
              void submitForm(formSchema, values, freeText, occurredStart)
            }
            onDismiss={() => setFormSchemaId(null)}
          />
        ) : (
          <form
            className="ledger-capture"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && text.trim().length > 0) void organize(text);
            }}
          >
            <textarea
              className="ledger-capture-input"
              value={text}
              onChange={(event) => dispatch({ type: "TYPE", text: event.target.value })}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  if (!busy && text.trim().length > 0) void organize(text);
                }
              }}
              placeholder="오늘 한 일, 배운 것, 떠오른 생각을 그대로 적으세요 · 여러 가지를 한 번에 써도 돼요"
              aria-label="빠른 기록"
              rows={2}
              disabled={busy}
            />
            <div className="ledger-capture-foot composer-foot">
              <div className="composer-chips" role="group" aria-label="입력 형식">
                <span className="composer-chip is-active">자동</span>
                {recentSchemas.map((schemaId) => {
                  const schema = ledger.registry.get(schemaId);
                  if (!schema) return null;
                  return (
                    <button
                      key={schemaId}
                      type="button"
                      className="composer-chip"
                      onClick={() => setFormSchemaId(schemaId)}
                    >
                      {schema.name}
                    </button>
                  );
                })}
                <select
                  className="composer-chip composer-chip-select"
                  aria-label="모든 형식"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) setFormSchemaId(event.target.value);
                  }}
                >
                  <option value="">모든 형식…</option>
                  {ledger.registry
                    .list()
                    .filter((schema) => schema.layer === "occurrence" || schema.layer === "distilled")
                    .map((schema) => (
                      <option key={schema.id} value={schema.id}>
                        {schema.name}
                      </option>
                    ))}
                </select>
              </div>
              {detectionHint ? <span className="composer-hint">{detectionHint} 감지</span> : null}
              {busy ? (
                <span className="composer-hint composer-organizing" role="status">
                  <Check size={12} aria-hidden="true" /> 원문 보관됨 · 정리하는 중…
                </span>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                icon={Sparkles}
                disabled={text.trim().length === 0 || busy}
              >
                정리
              </Button>
            </div>
          </form>
        )}
      </section>
    );
  }

  // ---- reviewing · nothing worth a record -------------------------------
  // A low-signal capture (a bare command, tool-run, path) proposes no records:
  // the raw source is already kept, so this is a calm confirmation, not an
  // empty candidate list. It says plainly why, and 원문으로 돌아가기 lets the
  // user re-word if Mori read it wrong.
  if (state.phase === "reviewing" && state.outcome.records.length === 0) {
    const signal = classifyCaptureSignal(state.text);
    const reason = signal.signal === "low" ? lowSignalReasonLabel(signal.reason) : null;
    return (
      <section className="composer composer-review composer-review-empty" aria-label="원문 보관됨">
        <header className="composer-review-head">
          <strong>원문만 보관했어요</strong>
          <span className="composer-review-sub">
            <Check size={12} aria-hidden="true" /> 원문 보관됨
          </span>
        </header>
        <p className="composer-review-empty-copy">
          <FileText size={14} aria-hidden="true" />
          {reason ? `${reason} 기록으로 만들지 않았어요.` : "구조화할 내용이 없어 기록으로 만들지 않았어요."}
          <span> 원문은 그대로 남아 있어요.</span>
        </p>
        <footer className="composer-review-foot">
          <Button variant="primary" disabled={state.saving} onClick={() => void save(true)}>
            확인
          </Button>
          <button
            type="button"
            className="composer-link"
            onClick={() => dispatch({ type: "BACK_TO_TEXT" })}
          >
            <ArrowLeft size={12} aria-hidden="true" /> 원문으로 돌아가기
          </button>
        </footer>
      </section>
    );
  }

  // ---- reviewing ----------------------------------------------------------
  if (state.phase === "reviewing") {
    const keptCount = keptRecordIds(state).length;
    return (
      <section className="composer composer-review" aria-label="정리 확인">
        <header className="composer-review-head">
          <strong>기록 {state.outcome.records.length}건으로 이해했어요</strong>
          <span className="composer-review-sub">
            <Check size={12} aria-hidden="true" /> 원문 보관됨
          </span>
          <button
            type="button"
            className="composer-link"
            onClick={() => dispatch({ type: "BACK_TO_TEXT" })}
          >
            <ArrowLeft size={12} aria-hidden="true" /> 원문으로 돌아가기
          </button>
        </header>

        <div className="composer-cands">
          {state.outcome.records.map((item) => (
            <CandidateCard
              key={item.created.record.id}
              item={item}
              ledger={ledger}
              edit={state.edits[item.created.record.id]}
              excluded={state.excluded.includes(item.created.record.id)}
              disabled={state.saving}
              onEdit={(edit: CandidateEdit) =>
                dispatch({ type: "EDIT", recordId: item.created.record.id, edit })
              }
              onToggleExclude={() =>
                dispatch({ type: "TOGGLE_EXCLUDE", recordId: item.created.record.id })
              }
            />
          ))}
        </div>

        <footer className="composer-review-foot">
          <Button
            variant="primary"
            disabled={state.saving || keptCount === 0}
            onClick={() => void save(false)}
          >
            {state.saving ? "저장하는 중…" : `${keptCount}건 저장`}
          </Button>
          <Button variant="secondary" disabled={state.saving} onClick={() => void save(true)}>
            원문만 저장
          </Button>
          <span className="composer-hint">저장 후에도 되돌릴 수 있어요</span>
        </footer>
      </section>
    );
  }

  // ---- saved --------------------------------------------------------------
  if (state.phase === "saved") {
    return (
      <section className="composer composer-saved" role="status" aria-label="저장됨">
        {state.undone ? (
          <>
            <span>
              <Undo2 size={13} aria-hidden="true" /> 되돌렸어요 · 원문은 보관되어 있어요
            </span>
          </>
        ) : state.savedRecordIds.length === 0 ? (
          // Source-only save (low-signal capture, or 원문만 저장): nothing to undo.
          <span>
            <Check size={13} aria-hidden="true" /> 원문을 보관했어요
          </span>
        ) : (
          <>
            <span>
              <Check size={13} aria-hidden="true" /> 기록 {state.savedRecordIds.length}건 정리됨
            </span>
            <button type="button" className="composer-link" onClick={() => void undo()}>
              되돌리기
            </button>
          </>
        )}
        <button
          type="button"
          className="composer-close"
          aria-label="닫기"
          onClick={() => dispatch({ type: "DISMISS" })}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </section>
    );
  }

  // ---- failed -------------------------------------------------------------
  return (
    <section className="composer composer-failed" role="alert" aria-label="정리 실패">
      <span className="composer-failed-msg">
        {state.error.message} · 원문은 보관됐어요
      </span>
      <span className="composer-failed-actions">
        <Button variant="secondary" icon={RotateCcw} onClick={() => dispatch({ type: "RETRY" })}>
          다시 시도
        </Button>
        <Button variant="secondary" onClick={() => void manualNote()}>
          노트로 저장
        </Button>
        <button type="button" className="composer-link" onClick={() => dispatch({ type: "CLEAR" })}>
          나중에
        </button>
      </span>
    </section>
  );
}

