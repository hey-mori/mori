import { Layers3, MessageSquare, Sparkles, Terminal, User } from "lucide-react";
import { useState } from "react";
import type { TimelineEvent } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import { sortDisplayItemsChronologically } from "../../lib/timeline/displayItems";
import {
  splitTurnSegments,
  type ConversationTurnRole,
} from "../../lib/timeline/conversationFlow";
import type { TimelineRenderModel } from "../../lib/timeline/timelineViewModel";

/**
 * Conversation flow view — the readable, time-ordered reading mode for a
 * single Claude conversation.
 *
 * Phase 1 made one session hold one conversation. The swimlane canvas was
 * built for sessions that mix many event types across lanes; a single
 * conversation collapses into one dense lane, so this view drops the lanes
 * entirely and renders the turns as a vertical thread: user asks above,
 * Claude replies below, tool activity muted. It is strictly time-ordered, so
 * the user always knows the timeline's basis is "시간순".
 *
 * Selecting a turn drives the same `selectedEventId` the canvas uses, so the
 * view toggle keeps the selection intact in both directions. Bundles (rapid
 * runs of turns) render as a collapsed group the user can expand inline.
 */
export function ConversationFlowView({
  model,
  selectedItemId,
  onSelect,
}: {
  model: TimelineRenderModel;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
}) {
  const items = sortDisplayItemsChronologically(model.visibleDisplayItems);
  if (items.length === 0) return null;

  return (
    <ol className="conversation-flow" aria-label="대화 흐름">
      {items.map((item) => {
        if (item.kind === "bundle") {
          return (
            <ConversationBundleGroup
              key={item.id}
              bundleId={item.id}
              title={item.title}
              start={item.start}
              end={item.end}
              count={item.count}
              members={model.visibleEvents.filter((event) =>
                item.memberEventIds.includes(event.id),
              )}
              selectedItemId={selectedItemId}
              onSelect={onSelect}
            />
          );
        }

        const selected =
          item.id === selectedItemId ||
          (selectedItemId != null && item.memberEventIds.includes(selectedItemId));
        return (
          <li key={item.id}>
            <ConversationTurn
              event={item.event}
              selected={selected}
              onSelect={onSelect}
            />
          </li>
        );
      })}
    </ol>
  );
}

/** A run of rapid-fire turns, collapsed by default and expandable inline. */
function ConversationBundleGroup({
  bundleId,
  title,
  start,
  end,
  count,
  members,
  selectedItemId,
  onSelect,
}: {
  bundleId: string;
  title: string;
  start: string;
  end: string;
  count: number;
  members: TimelineEvent[];
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
}) {
  const selectionInside =
    selectedItemId != null && members.some((event) => event.id === selectedItemId);
  const [expanded, setExpanded] = useState(selectionInside);
  const open = expanded || selectionInside;

  return (
    <li className="conversation-flow-group">
      <button
        type="button"
        className="conversation-flow-group-head"
        aria-expanded={open}
        onClick={() => {
          setExpanded((value) => !value);
          onSelect(bundleId);
        }}
      >
        <span className="conversation-flow-group-icon" aria-hidden="true">
          <Layers3 size={14} />
        </span>
        <span className="conversation-flow-group-body">
          <strong>{title}</strong>
          <small>
            {formatTime(start)}–{formatTime(end)} · 대화 턴 {count}개
          </small>
        </span>
        <span className="conversation-flow-group-toggle">{open ? "접기" : "펼치기"}</span>
      </button>
      {open ? (
        <ol className="conversation-flow-group-members">
          {members.map((event) => (
            <li key={event.id}>
              <ConversationTurn
                event={event}
                selected={event.id === selectedItemId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

const ROLE_ICON: Record<ConversationTurnRole, typeof User> = {
  user: User,
  assistant: Sparkles,
  tool: Terminal,
  system: MessageSquare,
};

/** One conversation turn — user ask + Claude reply (+ optional tool note). */
function ConversationTurn({
  event,
  selected,
  onSelect,
}: {
  event: TimelineEvent;
  selected: boolean;
  onSelect: (eventId: string) => void;
}) {
  const segments = splitTurnSegments(event);
  return (
    <button
      type="button"
      className={`conversation-turn ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(event.id)}
    >
      <span className="conversation-turn-time">{formatTime(event.start)}</span>
      <span className="conversation-turn-segments">
        {segments.map((segment, index) => {
          const Icon = ROLE_ICON[segment.role];
          return (
            <span
              key={`${event.id}-${index}`}
              className={`conversation-segment role-${segment.role}`}
            >
              <span className="conversation-segment-role">
                <Icon size={12} aria-hidden="true" />
                {segment.label}
              </span>
              <span className="conversation-segment-text">{segment.text}</span>
            </span>
          );
        })}
      </span>
    </button>
  );
}
