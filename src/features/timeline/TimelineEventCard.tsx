import { useCallback, useState, type CSSProperties, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import type { LaidOutTimelineItem, TimelineDensity } from "../../lib/timeline/collisionLayout";
import { focusStateClassName, type EventFocusState } from "../../lib/timeline/focusState";
import type { SourceKind, SourceRef, TimelineEvent } from "../../domain/types";
import {
  buildTimelineEventCardViewModel,
  formatFileActivityDiff,
} from "./lib/timelineCards";
import { activityKindIcons, sourceFamilyIcons } from "./lib/activityIcons";
import type { TimelineSourceFamily } from "../../lib/timeline/activityModel";
import {
  BaseContextMenu,
  useContextMenuPosition,
  type BaseMenuItemSpec,
} from "../../components/ui/BaseActionMenu";

/** Below this width an accurate (short-duration) card has no room for its
 *  icon + label, so it renders as a bare tone tick; the detail is in the hover
 *  preview. */
const NARROW_CARD_WIDTH = 30;

export function TimelineEventCard({
  event,
  layout,
  focusState,
  density,
  onSelect,
  onHover,
  menuItems,
  sourceIndex,
}: {
  event: TimelineEvent;
  layout: LaidOutTimelineItem;
  focusState: EventFocusState;
  density: TimelineDensity;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
  menuItems?: BaseMenuItemSpec[];
  sourceIndex?: ReadonlyMap<string, SourceRef>;
}) {
  const menu = useContextMenuPosition();
  const vm = buildTimelineEventCardViewModel(event, sourceIndex ?? []);
  const sourceMark = buildSourceMark(event, sourceIndex, vm);
  const MarkIcon = sourceMark.icon;
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const densityClass = densityClassName(density);
  const fileDiff = vm.fileActivity ? formatFileActivityDiff(vm.fileActivity) : "";
  const fileLine = vm.fileActivity
    ? vm.fileActivity.filesChanged > 0
      ? `${vm.fileActivity.filesLabel}${fileDiff ? ` · ${fileDiff}` : ""}`
      : `${vm.fileActivity.filesLabel} 읽기`
    : null;
  const preview: TimelineHoverPreview = {
    meta: [vm.timeLabel, sourceMark.label, fileLine, vm.primaryMeta].filter(
      (item): item is string => Boolean(item),
    ),
    title: vm.title,
    summary: event.summary,
  };

  const showHover = useCallback(
    (target: HTMLElement) => {
      setHoverAnchor(target.getBoundingClientRect());
      onHover(event.id);
    },
    [event.id, onHover],
  );

  const hideHover = useCallback(() => {
    setHoverAnchor(null);
    onHover(null);
  }, [onHover]);

  return (
    <>
      <button
        className={`event-card card-${vm.tone} ${focusStateClassName(focusState)} ${densityClass}${
          event.openedByUser ? " is-request" : ""
        }${layout.width < NARROW_CARD_WIDTH ? " is-narrow" : ""}`}
        onClick={() => onSelect(event.id)}
        onContextMenu={menuItems ? menu.onContextMenu : undefined}
        onKeyDown={menuItems ? menu.onKeyDown : undefined}
        onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => showHover(e.currentTarget)}
        onMouseLeave={hideHover}
        onFocus={(e: FocusEvent<HTMLButtonElement>) => showHover(e.currentTarget)}
        onBlur={hideHover}
        style={{
          left: `${layout.x}px`,
          top: `${layout.y}px`,
          width: `${layout.width}px`,
          height: `${layout.height}px`,
        }}
        type="button"
        aria-pressed={focusState === "selected"}
        aria-label={vm.ariaLabel}
        data-preview={`${vm.timeLabel} · ${sourceMark.label}\n${vm.title}\n${event.summary}`}
      >
        <span className="event-card-row">
          <span
            className={`event-card-source-mark tone-${vm.tone} mark-${sourceMark.kind}`}
            aria-hidden="true"
          >
            {sourceMark.text ? sourceMark.text : <MarkIcon size={12} strokeWidth={2.2} />}
          </span>
          <strong className="event-card-title">{vm.title}</strong>
          {vm.fileActivity && vm.fileActivity.filesChanged > 0 ? (
            <span
              className="event-card-files"
              aria-hidden="true"
              title={fileLine ?? undefined}
            >
              {fileDiff || `${vm.fileActivity.filesChanged}파일`}
            </span>
          ) : null}
        </span>
        {menuItems ? (
          <BaseContextMenu
            open={menu.open}
            position={menu.position}
            items={menuItems}
            onClose={menu.close}
            label={`${event.title} 작업`}
          />
        ) : null}
      </button>
      <FloatingTimelineHoverCard anchor={hoverAnchor} preview={preview} />
    </>
  );
}

/** Map a density mode to the card's modifier class (comfortable = none). */
export function densityClassName(density: TimelineDensity): string {
  if (density === "dense") return "is-dense";
  if (density === "compact") return "is-compact";
  return "";
}

export type TimelineHoverPreview = {
  meta: string[];
  title: string;
  summary: string;
};

export function FloatingTimelineHoverCard({
  anchor,
  preview,
}: {
  anchor: DOMRect | null;
  preview: TimelineHoverPreview;
}) {
  if (!anchor || typeof document === "undefined") return null;

  const width = Math.min(320, Math.max(236, window.innerWidth - 24));
  const left = Math.min(Math.max(anchor.left, 12), Math.max(12, window.innerWidth - width - 12));
  const top = Math.min(anchor.bottom + 8, Math.max(12, window.innerHeight - 180));
  const arrowLeft = Math.min(Math.max(anchor.left + anchor.width / 2 - left, 20), width - 20);
  const style = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    "--hover-arrow-left": `${arrowLeft}px`,
  } as CSSProperties;

  return createPortal(
    <div className="timeline-hovercard timeline-hovercard-floating is-visible" style={style} role="tooltip">
      <span className="timeline-hovercard-meta">
        {preview.meta.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </span>
      <strong>{preview.title}</strong>
      <span>{preview.summary}</span>
    </div>,
    document.body,
  );
}

type SourceMark = {
  kind: string;
  label: string;
  text: string | null;
  icon: LucideIcon;
};

function buildSourceMark(
  event: TimelineEvent,
  sourceIndex: ReadonlyMap<string, SourceRef> | undefined,
  vm: ReturnType<typeof buildTimelineEventCardViewModel>,
): SourceMark {
  const source = event.sourceRefs.map((id) => sourceIndex?.get(id)).find(Boolean);
  const detected = detectAgentSource(source);
  if (detected) return detected;

  const family = vm.evidenceChips[0]?.sourceFamily ?? null;
  const icon = sourceFamilyIcons[(family ?? "unknown") as TimelineSourceFamily] ?? activityKindIcons[vm.activityKind];
  return {
    kind: family ?? vm.activityKind,
    label: source?.title || vm.sourceLabel || vm.activityLabel,
    text: null,
    icon,
  };
}

function detectAgentSource(source: SourceRef | undefined): SourceMark | null {
  const haystack = `${source?.kind ?? ""} ${source?.title ?? ""} ${source?.detail ?? ""}`.toLowerCase();
  const kind = source?.kind as SourceKind | undefined;
  if (kind === "claudeTranscript" || haystack.includes("claude")) {
    return { kind: "claude", label: "Claude", text: "Cl", icon: activityKindIcons.conversation };
  }
  if (kind === "codexTranscript" || haystack.includes("codex")) {
    return { kind: "codex", label: "Codex", text: "Cx", icon: activityKindIcons.fileChange };
  }
  if (kind === "chatgptTranscript" || haystack.includes("chatgpt")) {
    return { kind: "chatgpt", label: "ChatGPT", text: "GPT", icon: activityKindIcons.conversation };
  }
  if (kind === "terminal" || kind === "terminalShell") {
    return { kind: "terminal", label: "Terminal", text: "$", icon: activityKindIcons.command };
  }
  return null;
}
