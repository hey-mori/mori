import { ChevronDown, Layers3, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { useSessionStore } from "../../app/sessionStore";
import {
  projectEventRequestSummary,
  resolveDisclosureLevel,
  type DisclosureLevel,
} from "../../lib/disclosure";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { sortDisplayItemsChronologically } from "../../lib/timeline/displayItems";
import { foldStreamRows, type StreamRow } from "../../lib/timeline/streamRows";
import { formatTime } from "../../lib/formatting/time";
import type { TimelineRenderModel } from "../../lib/timeline/timelineViewModel";
import {
  buildTimelineBundleViewModel,
  buildTimelineEventCardViewModel,
  buildTrustGlyph,
  formatFileActivityDiff,
  type TimelineCardFileActivity,
} from "./lib/timelineCards";
import { activityKindIcons } from "./lib/activityIcons";
import {
  BaseContextMenu,
  useContextMenuPosition,
  type BaseMenuItemSpec,
} from "../../components/ui/BaseActionMenu";

/**
 * 목록 (content list) — the reading mode that answers *what happened*.
 *
 * The swimlane positions events on a time axis but reads as bare chips; this
 * view stacks the same events as a single time-ordered column where each row
 * carries a one-line content preview (the event's summary) so the work is
 * scannable without opening the inspector. Selecting a row discloses the full
 * summary + its trust / linked-item counts inline, and drives the same
 * `selectedEventId` the swimlane uses, so switching views keeps the selection.
 */
export function TimelineChronoList({
  model,
  selectedItemId,
  onSelect,
  density,
  eventMenuItems,
}: {
  model: TimelineRenderModel;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
  density: TimelineDensity;
  eventMenuItems?: (event: TimelineEvent) => BaseMenuItemSpec[];
}) {
  const requestDisclosureDefault = useSessionStore(
    (state) => state.analysisSettings.requestDisclosureLevel,
  );
  const requestDisclosureOverrides = useSessionStore((state) => state.requestDisclosureOverrides);
  const listRef = useRef<HTMLOListElement | null>(null);
  // Bring the selected row into view when the selection changes, so a deep-link
  // to an event (the overview reopen anchor, a review item's related event) or
  // keyboard navigation lands on a row that is actually on screen. `nearest`
  // never jumps when the row is already visible, so clicking a visible row stays
  // put.
  useEffect(() => {
    if (selectedItemId == null) return;
    listRef.current
      ?.querySelector(".timeline-chrono-row.is-selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedItemId]);
  // Fold runs of tool calls so the stream reads as conversation, not a wall of
  // Grep / Bash / Read rows.
  const rows = foldStreamRows(sortDisplayItemsChronologically(model.visibleDisplayItems));
  if (rows.length === 0) return null;

  return (
    <ol ref={listRef} className={`timeline-chrono-list is-${density}`} aria-label="활동 목록">
      {rows.map((row) => {
        if (row.kind === "toolRun") {
          return <ToolRunRow key={row.id} run={row} />;
        }
        const item = row.item;
        const selected =
          item.id === selectedItemId ||
          (selectedItemId != null && item.memberEventIds.includes(selectedItemId));

        if (item.kind === "bundle") {
          const vm = buildTimelineBundleViewModel(item);
          // The title already carries "{무엇} {몇 건} · {언제}", so the card needs
          // no summary line and no "N개 이벤트" echo. The type-mix meta shows only
          // when the bundle actually mixes lanes ("대화 5 · 코드 2"); a single-lane
          // bundle would just repeat the title. Detail lives in the inspector — no
          // inline dropdown, so the card never opens in two places at once.
          const showMix = vm.typeMixLabel.includes("·");
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`timeline-chrono-row card-${vm.tone} ${selected ? "is-selected" : ""}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(item.id)}
              >
                {/* Start time only — the title already carries the full range,
                    so the column stays narrow and never repeats it. */}
                <span className="timeline-chrono-time">{formatTime(item.start)}</span>
                <span className={`timeline-chrono-icon tone-${vm.tone}`}>
                  <Layers3 size={14} aria-hidden="true" />
                </span>
                <span className="timeline-chrono-body">
                  <strong>{vm.title}</strong>
                  {showMix ? <small>{vm.typeMixLabel}</small> : null}
                </span>
              </button>
            </li>
          );
        }

        return (
          <TimelineChronoEventRow
            key={item.id}
            event={item.event}
            selected={selected}
            isRequest={item.event.openedByUser === true}
            onSelect={() => onSelect(item.id)}
            menuItems={eventMenuItems?.(item.event)}
            sourceIndex={model.sourceIndex}
            requestDisclosureLevel={resolveDisclosureLevel(
              requestDisclosureOverrides[item.event.id],
              requestDisclosureDefault,
            )}
          />
        );
      })}
    </ol>
  );
}

/**
 * A folded run of tool calls. A single call reads as one quiet line; a run of
 * several collapses to "도구 N개 · Grep · Bash" that expands to list each call —
 * so the conversation stays the spine of the stream.
 */
function ToolRunRow({ run }: { run: Extract<StreamRow, { kind: "toolRun" }> }) {
  const [expanded, setExpanded] = useState(false);
  const count = run.events.length;
  const first = run.events[0];
  const timeLabel = formatTime(first.event.start);

  if (count === 1) {
    return (
      <li>
        <div className="timeline-chrono-toolrun is-single">
          <span className="timeline-chrono-time">{timeLabel}</span>
          <Wrench size={13} aria-hidden="true" />
          <span className="timeline-chrono-toolrun-label">{oneLine(first.event.title, 90)}</span>
        </div>
      </li>
    );
  }

  const toolsLabel = run.tools.length > 0 ? run.tools.join(" · ") : "도구";
  return (
    <li>
      <button
        type="button"
        className="timeline-chrono-toolrun"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="timeline-chrono-time">{timeLabel}</span>
        <Wrench size={13} aria-hidden="true" />
        <span className="timeline-chrono-toolrun-label">
          도구 {count}개 · {toolsLabel}
        </span>
        <ChevronDown
          size={13}
          className={`timeline-chrono-toolrun-chevron${expanded ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <ul className="timeline-chrono-toolrun-list" role="region">
          {run.events.map((toolEvent) => (
            <li key={toolEvent.id}>
              <span className="timeline-chrono-time">{formatTime(toolEvent.event.start)}</span>
              <span className="timeline-chrono-toolrun-item">{oneLine(toolEvent.event.title, 100)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TimelineChronoEventRow({
  event,
  selected,
  isRequest = false,
  onSelect,
  menuItems,
  sourceIndex,
  requestDisclosureLevel,
}: {
  event: TimelineEvent;
  selected: boolean;
  isRequest?: boolean;
  onSelect: () => void;
  menuItems?: BaseMenuItemSpec[];
  sourceIndex?: ReadonlyMap<string, SourceRef>;
  requestDisclosureLevel: DisclosureLevel;
}) {
  const menu = useContextMenuPosition();
  const vm = buildTimelineEventCardViewModel(event, sourceIndex ?? []);
  const Icon = activityKindIcons[vm.activityKind] ?? activityKindIcons.unknown;
  // The user's own request text obeys the disclosure level here too, so a
  // withheld request cannot leak through the narrow-width list view.
  const requestProjection = projectEventRequestSummary(event, requestDisclosureLevel);
  const snippet = oneLine(requestProjection.text);
  return (
    <li className={isRequest ? "is-request" : undefined}>
      {isRequest ? <span className="timeline-chrono-request-tag">요청</span> : null}
      <button
        type="button"
        className={`timeline-chrono-row card-${vm.tone} ${selected ? "is-selected" : ""}`}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        onContextMenu={menuItems ? menu.onContextMenu : undefined}
        onKeyDown={menuItems ? menu.onKeyDown : undefined}
      >
        <span className="timeline-chrono-time">{vm.timeLabel}</span>
        <span className={`timeline-chrono-icon tone-${vm.tone}`}>
          <Icon size={14} aria-hidden="true" />
        </span>
        <span className="timeline-chrono-body">
          <strong>{vm.title}</strong>
          {snippet ? <span className="timeline-chrono-snippet">{snippet}</span> : null}
          {vm.fileActivity && vm.fileActivity.filesChanged > 0 ? (
            <span className="timeline-chrono-files">{fileActivityLine(vm.fileActivity)}</span>
          ) : null}
          <small>
            {vm.categoryLabel} · {vm.trust.label}
            {vm.primaryMeta ? ` · ${vm.primaryMeta}` : ""}
          </small>
        </span>
      </button>
      {selected ? (
        <div className="timeline-chrono-detail" role="region">
          {requestProjection.text ? (
            <p>{requestProjection.text}</p>
          ) : (
            <p className="timeline-chrono-withheld">원문이 표시되지 않도록 설정됨</p>
          )}
          <small>{eventDetailMeta(event)}</small>
        </div>
      ) : null}
      {menuItems ? (
        <BaseContextMenu
          open={menu.open}
          position={menu.position}
          items={menuItems}
          onClose={menu.close}
          label={`${event.title} 작업`}
        />
      ) : null}
    </li>
  );
}

/** "commandSpace.ts 외 2 · +64 -12" — what the turn did to the codebase, the
 *  signal the read view adds over a bare summary. Diff omitted when no counts. */
function fileActivityLine(activity: TimelineCardFileActivity): string {
  const diff = formatFileActivityDiff(activity);
  return diff ? `${activity.filesLabel} · ${diff}` : activity.filesLabel;
}

/** Collapse a summary to a single readable preview line for a list row. */
function oneLine(text: string | undefined, max = 120): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

/**
 * One calm detail line for a selected row: trust + linked-item counts, the
 * progressive disclosure the side inspector would otherwise carry.
 */
function eventDetailMeta(event: TimelineEvent): string {
  const parts = [buildTrustGlyph(event.trustLevel, event.confidence).label];
  if (event.trustLevel === "inferred") {
    parts.push(`신뢰도 ${Math.round(event.confidence * 100)}%`);
  }
  if (event.sourceRefs.length > 0) parts.push(`근거 ${event.sourceRefs.length}`);
  if (event.linkedIssueIds.length > 0) parts.push(`이슈 ${event.linkedIssueIds.length}`);
  if (event.linkedDecisionIds.length > 0) parts.push(`결정 ${event.linkedDecisionIds.length}`);
  return parts.join(" · ");
}
