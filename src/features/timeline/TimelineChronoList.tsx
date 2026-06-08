import { Layers3 } from "lucide-react";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import { useSessionStore } from "../../app/sessionStore";
import {
  projectEventRequestSummary,
  resolveDisclosureLevel,
  type DisclosureLevel,
} from "../../lib/disclosure";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { sortDisplayItemsChronologically } from "../../lib/timeline/displayItems";
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
  const items = sortDisplayItemsChronologically(model.visibleDisplayItems);
  if (items.length === 0) return null;

  return (
    <ol className={`timeline-chrono-list is-${density}`} aria-label="활동 목록">
      {items.map((item) => {
        const selected =
          item.id === selectedItemId ||
          (selectedItemId != null && item.memberEventIds.includes(selectedItemId));

        if (item.kind === "bundle") {
          const vm = buildTimelineBundleViewModel(item);
          const memberList = item.members
            .slice(0, 5)
            .map((member) => member.title)
            .join(", ");
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`timeline-chrono-row card-${vm.tone} ${selected ? "is-selected" : ""}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(item.id)}
              >
                <span className="timeline-chrono-time">{vm.timeLabel}</span>
                <span className={`timeline-chrono-icon tone-${vm.tone}`}>
                  <Layers3 size={14} aria-hidden="true" />
                </span>
                <span className="timeline-chrono-body">
                  <strong>{vm.title}</strong>
                  {item.summary ? (
                    <span className="timeline-chrono-snippet">{oneLine(item.summary)}</span>
                  ) : null}
                  <small>
                    {vm.typeMixLabel} · {item.count}개 이벤트
                  </small>
                </span>
              </button>
              {selected ? (
                <div className="timeline-chrono-detail" role="region">
                  <p>{item.summary}</p>
                  <small>
                    포함된 이벤트: {memberList}
                    {item.members.length > 5 ? ` 외 ${item.members.length - 5}건` : ""}
                  </small>
                </div>
              ) : null}
            </li>
          );
        }

        return (
          <TimelineChronoEventRow
            key={item.id}
            event={item.event}
            selected={selected}
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

function TimelineChronoEventRow({
  event,
  selected,
  onSelect,
  menuItems,
  sourceIndex,
  requestDisclosureLevel,
}: {
  event: TimelineEvent;
  selected: boolean;
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
    <li>
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
