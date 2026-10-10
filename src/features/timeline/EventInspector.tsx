import { StickyNote } from "lucide-react";
import { readableAgentText } from "../../lib/session/agentText";
import { readableEventSummary, readableEventTitle } from "./lib/timelineCards";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import {
  BaseInspectorPanel,
  InspectorSection,
  InspectorCard,
  InspectorActions,
} from "../../components/ui/BaseInspectorPanel";
import { InlineEditForm } from "../review/InlineEditForm";
import type { TimelineEventEdits } from "../../lib/timeline/eventEdits";
import { Button } from "../../components/ui/Button";
import type {
  Artifact,
  Decision,
  FileTouch,
  Issue,
  MockSession,
  NextAction,
  TimelineEvent,
} from "../../domain/types";
import {
  rollUpFileTouches,
  type FileProvenanceEntry,
} from "../../lib/file-provenance/fileProvenance";
import { formatTime, formatTimeRange } from "../../lib/formatting/time";
import {
  getTimelineInspectorReviewLinks,
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";
import { buildInspectorViewModel } from "../../lib/timeline/timelineViewModel";
import { useSessionStore } from "../../app/sessionStore";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  isUserRequestEvent,
  projectEventRequestSummary,
  resolveDisclosureLevel,
  DISCLOSURE_LABELS,
  type DisclosureLevel,
} from "../../lib/disclosure";

const DISCLOSURE_OPTIONS: { id: DisclosureLevel; label: string }[] = [
  { id: "raw", label: DISCLOSURE_LABELS.raw },
  { id: "summary", label: DISCLOSURE_LABELS.summary },
  { id: "abstract", label: DISCLOSURE_LABELS.abstract },
  { id: "hidden", label: DISCLOSURE_LABELS.hidden },
];

export function EventInspector({
  selectedEvent,
  session,
  onOpenReviewItem,
  canWrite = false,
  onEditEvent,
  onClose,
}: {
  selectedEvent: TimelineEvent;
  session: MockSession;
  /** Deep-link a linked issue / decision / next action into the Review surface. */
  onOpenReviewItem?: (selection: ReviewSelection) => void;
  /** True when the active session can persist Timeline writes (real draft). */
  canWrite?: boolean;
  /** Persist a user note on this event. Absent ⇒ the note editor is hidden.
   *  This panel reads an AI-produced event; structural edits (제목/요약 수정,
   *  분할·병합, 이슈 생성) are intentionally retired from here — they live in the
   *  row right-click menu and the 검토 surface — so only the note write stays. */
  onEditEvent?: (edits: TimelineEventEdits) => void;
  /** Close the inspector from within the panel. Absent ⇒ the X is hidden. */
  onClose?: () => void;
}) {
  const [noteEditing, setNoteEditing] = useState(false);
  const requestDisclosureDefault = useSessionStore(
    (state) => state.analysisSettings.requestDisclosureLevel,
  );
  const requestDisclosureOverrides = useSessionStore((state) => state.requestDisclosureOverrides);
  const setRequestDisclosureOverride = useSessionStore(
    (state) => state.setRequestDisclosureOverride,
  );
  const provider = useSessionStore((state) => state.analysisSettings.provider);
  const requestAbstractions = useSessionStore((state) => state.requestAbstractions);
  const generateRequestAbstraction = useSessionStore((state) => state.generateRequestAbstraction);
  const [generatingAbstraction, setGeneratingAbstraction] = useState(false);
  // Full turn text retained at import: the request (the user's words, always
  // privacy-gated) and the assistant's reply (shown in full). Falls back to the
  // truncated summary for events that kept no full text (tools, old imports).
  const fullRequest = selectedEvent.requestText?.trim() ?? "";
  const fullResponse = selectedEvent.responseText?.trim() ?? "";
  const hasTurnText = Boolean(fullRequest || fullResponse);
  // The request is privacy-sensitive whether it is a lone ask (actor "user") or
  // the ask side of a Q&A pair (actor "assistant"), so gate it whenever present.
  const isUserRequest = isUserRequestEvent(selectedEvent) || Boolean(fullRequest);
  const effectiveDisclosureLevel = resolveDisclosureLevel(
    requestDisclosureOverrides[selectedEvent.id],
    requestDisclosureDefault,
  );
  const abstractionEntry = requestAbstractions[selectedEvent.id];
  // Project the request from its full retained text when present, else summary.
  const requestSource = fullRequest || selectedEvent.summary;
  const requestProjection = projectEventRequestSummary(
    { actor: "user", summary: requestSource },
    effectiveDisclosureLevel,
    abstractionEntry,
  );

  async function handleGenerateAbstraction() {
    setGeneratingAbstraction(true);
    try {
      await generateRequestAbstraction(selectedEvent.id, requestSource);
    } finally {
      setGeneratingAbstraction(false);
    }
  }

  // The disclosure toggle and the gated request body, shared by the structured
  // "보낸 요청" card and the summary fallback so request text hides identically.
  const disclosureControl = (
    <SegmentedControl
      ariaLabel="이 요청 표시 수준"
      role="radiogroup"
      value={effectiveDisclosureLevel}
      onChange={(level) => setRequestDisclosureOverride(selectedEvent.id, level)}
      options={DISCLOSURE_OPTIONS}
    />
  );
  const gatedRequestBody = (
    <>
      {requestProjection.text ? (
        <p>{readableAgentText(requestProjection.text)}</p>
      ) : (
        <p className="ins-withheld">
          원문이 표시되지 않도록 설정되어 있습니다. 데이터는 그대로 저장됩니다.
        </p>
      )}
      {requestProjection.isWithheld && requestProjection.text ? (
        <span className="ins-subnote">원문 비공개 · 데이터는 그대로 저장됩니다</span>
      ) : null}
      {effectiveDisclosureLevel !== "raw" && provider === "ollama" ? (
        <div className="ins-inline-row">
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleGenerateAbstraction}
            disabled={generatingAbstraction}
          >
            {generatingAbstraction ? "생성 중..." : "로컬 LLM으로 요지 생성"}
          </button>
          {abstractionEntry ? (
            <span className="ins-subnote">
              {abstractionEntry.source === "llm"
                ? "로컬 LLM이 생성한 요지"
                : `기본 요지 사용${abstractionEntry.note ? ` · ${abstractionEntry.note}` : ""}`}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
  const inspector = buildInspectorViewModel({
    event: selectedEvent,
    view: session,
  });
  const activity = inspector.activity;
  const hasLinks =
    inspector.issues.length +
      inspector.decisions.length +
      inspector.artifacts.length +
      inspector.nextActions.length +
      inspector.hiddenRelationshipCount >
    0;

  const shownTitle = readableEventTitle(selectedEvent);
  const shownSummary = readableEventSummary(selectedEvent, shownTitle);

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="이벤트 인스펙터"
      onClose={onClose}
      eyebrow={
        <>
          <Badge tone={activity.laneVisuals.tone}>{activity.laneVisuals.label}</Badge>
          {selectedEvent.userModified ? <Badge tone="orange">사용자 수정</Badge> : null}
        </>
      }
      title={shownTitle}
      meta={formatTimeRange(selectedEvent.start, selectedEvent.end)}
    >
      {hasTurnText || isUserRequest || shownSummary ? (
      <InspectorSection>
        {hasTurnText ? (
          <>
            {fullRequest ? (
              <InspectorCard label="보낸 요청" action={disclosureControl}>
                {gatedRequestBody}
              </InspectorCard>
            ) : null}
            {fullResponse ? (
              <InspectorCard label="받은 답변">
                <p>{fullResponse}</p>
              </InspectorCard>
            ) : null}
          </>
        ) : isUserRequest ? (
          <InspectorCard label="요약" action={disclosureControl}>
            {gatedRequestBody}
          </InspectorCard>
        ) : shownSummary ? (
          // A summary that only repeats the heading adds nothing; leave it out.
          <InspectorCard label="요약">
            <p>{shownSummary}</p>
          </InspectorCard>
        ) : null}
      </InspectorSection>
      ) : null}

      <EventFilesSection touches={selectedEvent.fileTouches} />

      {hasLinks ? (
        <InspectorSection
          title="연결된 항목"
          hint={
            inspector.hiddenRelationshipCount > 0
              ? `+${inspector.hiddenRelationshipCount}개 숨김`
              : undefined
          }
        >
          <LinkedRows
            issues={inspector.issues}
            decisions={inspector.decisions}
            artifacts={inspector.artifacts}
            nextActions={inspector.nextActions}
            onOpenReviewItem={onOpenReviewItem}
          />
        </InspectorSection>
      ) : null}

      {inspector.decisions.length > 0 ? (
        <InspectorSection title="영향">
          <ul className="ins-impact">
            {inspector.decisions
              .flatMap((decision) => decision.impact)
              .slice(0, 3)
              .map((impact) => (
                <li key={impact}>{impact}</li>
              ))}
          </ul>
        </InspectorSection>
      ) : null}

      {selectedEvent.userNote || (canWrite && onEditEvent) ? (
      <InspectorSection title="메모">
        {noteEditing && onEditEvent ? (
          <InlineEditForm
            fields={[
              {
                id: "note",
                label: "메모",
                value: selectedEvent.userNote ?? "",
                multiline: true,
              },
            ]}
            onSave={(values) => {
              onEditEvent({ note: values.note });
              setNoteEditing(false);
            }}
            onCancel={() => setNoteEditing(false)}
          />
        ) : (
          <>
            {selectedEvent.userNote ? (
              <InspectorCard>
                <p>{selectedEvent.userNote}</p>
              </InspectorCard>
            ) : null}
            {onEditEvent ? (
              <InspectorActions>
                <Button
                  icon={StickyNote}
                  onClick={() => setNoteEditing(true)}
                  disabled={!canWrite}
                  title={
                    canWrite
                      ? "이 이벤트에 메모를 작성합니다."
                      : "실제 세션에서 사용할 수 있습니다."
                  }
                >
                  {selectedEvent.userNote ? "메모 편집" : "메모 추가"}
                </Button>
              </InspectorActions>
            ) : null}
          </>
        )}
      </InspectorSection>
      ) : null}
    </BaseInspectorPanel>
  );
}

/**
 * "이 턴이 만진 파일" — the files this turn's tool calls touched, rolled up per
 * file from the event's attributed `fileTouches`. Renders nothing when the turn
 * touched no files (the common case for a plain ask / reply), so it never adds
 * an empty section. This is where file provenance reaches the timeline.
 */
function EventFilesSection({ touches }: { touches?: FileTouch[] }) {
  if (!touches || touches.length === 0) return null;
  const entries = rollUpFileTouches(touches);
  if (entries.length === 0) return null;
  return (
    <InspectorSection title="이 턴이 만진 파일" hint={`${entries.length}개`}>
      <ul className="inspector-files" aria-label="이 턴이 만진 파일">
        {entries.map((entry) => (
          <li key={entry.path} className={`inspector-file kind-${entry.primaryChangeKind}`}>
            <div className="inspector-file-head">
              <span className="inspector-file-name" title={entry.path}>
                {entry.fileName}
              </span>
              <span className="inspector-file-meta">
                <span className="inspector-file-counts">{fileCountsLabel(entry)}</span>
                {entry.additions > 0 || entry.deletions > 0 ? (
                  <span className="inspector-file-diff">
                    {entry.additions > 0 ? (
                      <span className="add">+{entry.additions}</span>
                    ) : null}
                    {entry.deletions > 0 ? (
                      <span className="del">-{entry.deletions}</span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </div>
            {entry.diffPreview ? <FileDiffPeek diff={entry.diffPreview} /> : null}
          </li>
        ))}
      </ul>
    </InspectorSection>
  );
}

/**
 * A collapsed peek at the changed lines (added / removed only, already bounded
 * at capture). Folded by default so the inspector stays calm; opening it shows
 * the gist of the edit without leaving the timeline.
 */
function FileDiffPeek({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <details className="inspector-file-diffpeek">
      <summary>변경 미리보기</summary>
      <pre aria-label="변경된 줄 미리보기">
        {lines.map((line, index) => (
          <span key={index} className={diffLineClass(line)}>
            {line}
          </span>
        ))}
      </pre>
    </details>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  return "diff-ctx";
}

function fileCountsLabel(entry: FileProvenanceEntry): string {
  const parts: string[] = [];
  if (entry.wrote > 0) parts.push("생성");
  if (entry.edited > 0) parts.push("편집");
  if (entry.read > 0) parts.push("읽기");
  if (entry.touched > 0) parts.push("기타");
  return parts.join(" · ");
}

/** How many linked items to list per group before collapsing to "+N개 더". */
const LINKED_ITEMS_VISIBLE = 4;

function LinkedRows({
  issues,
  decisions,
  artifacts,
  nextActions,
  onOpenReviewItem,
}: {
  issues: Issue[];
  decisions: Decision[];
  artifacts: Artifact[];
  nextActions: NextAction[];
  onOpenReviewItem?: (selection: ReviewSelection) => void;
}) {
  // Each linked record carries its own Review target — a click deep-links to
  // that exact issue / decision / next action, not just the first of a group.
  // Artifacts have no Review home, so they render as plain context.
  const groups = getTimelineInspectorReviewLinks({ issues, decisions, nextActions, artifacts }).filter(
    (group) => group.items.length > 0,
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (groups.length === 0) {
    return <p className="inspector-empty">연결된 항목이 없습니다.</p>;
  }
  return (
    <ul className="inspector-linked-rows">
      {groups.map((group) => {
        const isExpanded = expanded.has(group.kind);
        const visible = isExpanded ? group.items : group.items.slice(0, LINKED_ITEMS_VISIBLE);
        const overflow = group.items.length - visible.length;
        return (
          <li key={group.kind} className="inspector-linked-group">
            <div className="inspector-linked-group-head">
              <Badge tone={group.tone}>{group.label}</Badge>
              <span className="inspector-linked-count">{group.items.length}</span>
            </div>
            {group.items.length === 0 ? (
              <span className="inspector-linked-empty">없음</span>
            ) : (
              <div className="inspector-linked-items">
                {visible.map((item) =>
                  item.selection && onOpenReviewItem ? (
                    <button
                      key={item.id}
                      type="button"
                      className="inspector-linked-item is-linkable"
                      onClick={() => onOpenReviewItem(item.selection as ReviewSelection)}
                      title="정리에서 이 항목 열기"
                    >
                      {item.title}
                    </button>
                  ) : (
                    <span key={item.id} className="inspector-linked-item" title={item.title}>
                      {item.title}
                    </span>
                  ),
                )}
                {overflow > 0 ? (
                  <button
                    type="button"
                    className="inspector-linked-more"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.add(group.kind);
                        return next;
                      })
                    }
                  >
                    +{overflow}개 더
                  </button>
                ) : isExpanded && group.items.length > LINKED_ITEMS_VISIBLE ? (
                  <button
                    type="button"
                    className="inspector-linked-more"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.delete(group.kind);
                        return next;
                      })
                    }
                  >
                    접기
                  </button>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export { formatTime };
