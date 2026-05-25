import {
  ChevronDown,
  ChevronRight,
  FileEdit,
  Sparkles,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { buildTurns, type Turn } from "../../lib/timeline/buildTurns";
import {
  groupTurns,
  type TurnGroup,
  type TurnGroupBurst,
  type TurnGroupOverflow,
} from "../../lib/timeline/groupTurns";
import { buildTurnCardModel, type TurnCardModel } from "../../lib/timeline/turnCard";
import { formatTime } from "../../lib/formatting/time";
import type { TimelineRenderModel } from "../../lib/timeline/timelineViewModel";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import type { TimelineEvent } from "../../domain/types";
import {
  MoriContextMenu,
  useContextMenuPosition,
  type MoriMenuItemSpec,
} from "../../components/ui/MoriActionMenu";

/**
 * Conversation flow view — the conversation-FIRST reading mode for a single
 * captured Claude conversation.
 *
 * A Mori session is one conversation, so the flow drops the swimlane and reads
 * the talk as a vertical thread of TURNS. Each turn is one clean card: the
 * user's ask (prominent), Claude's reply, and a collapsible muted strip of the
 * turn's tool calls + file edits (collapsed by default, with a "도구 7 · 파일 3"
 * count). Token usage, decisions, and issues ride along as small badges.
 *
 * Two honest groupings sit on top (see `groupTurns`): a **burst** — a tight run
 * of tool activity — carries a *visible criterion* ("3분 내 도구 호출 7회"); a
 * pure **overflow** is just an "이 아래 N개 더 보기" disclosure. They look
 * deliberately different so the user always knows what a collapsed card means.
 *
 * Selection drives the same `selectedEventId` the canvas uses, so the view
 * toggle keeps the selection intact in both directions.
 */
export function ConversationFlowView({
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
  eventMenuItems?: (event: TimelineEvent) => MoriMenuItemSpec[];
}) {
  // The visible events (already filtered + searched) are the conversation's
  // turns. `buildTurns` folds them by `turnId`; `groupTurns` then layers the
  // honest burst / overflow groupings on top of the chronological thread.
  const turns = buildTurns(model.visibleEvents);
  if (turns.length === 0) return null;
  const groups = groupTurns(turns, conversationGroupingOptions(density, turns.length));

  return (
    <ol className={`conversation-flow is-${density}`} aria-label="대화 흐름">
      {groups.map((group) => (
        <li key={group.id}>
          <ConversationGroup
            group={group}
            selectedItemId={selectedItemId}
            onSelect={onSelect}
            density={density}
            eventMenuItems={eventMenuItems}
          />
        </li>
      ))}
    </ol>
  );
}

function ConversationGroup({
  group,
  selectedItemId,
  onSelect,
  density,
  eventMenuItems,
}: {
  group: TurnGroup;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
  density: TimelineDensity;
  eventMenuItems?: (event: TimelineEvent) => MoriMenuItemSpec[];
}) {
  switch (group.kind) {
    case "turn":
      return (
        <TurnCard
          turn={group.turn}
          selected={isTurnSelected(group.turn, selectedItemId)}
          onSelect={onSelect}
          density={density}
          eventMenuItems={eventMenuItems}
        />
      );
    case "burst":
      return (
        <BurstGroup
          burst={group}
          selectedItemId={selectedItemId}
          onSelect={onSelect}
          density={density}
          eventMenuItems={eventMenuItems}
        />
      );
    case "overflow":
      return (
        <OverflowGroup
          overflow={group}
          selectedItemId={selectedItemId}
          onSelect={onSelect}
          density={density}
          eventMenuItems={eventMenuItems}
        />
      );
  }
}

/** One turn card: ask, reply, collapsible activity strip, badges. */
function TurnCard({
  turn,
  selected,
  onSelect,
  density,
  eventMenuItems,
}: {
  turn: Turn;
  selected: boolean;
  onSelect: (eventId: string) => void;
  density: TimelineDensity;
  eventMenuItems?: (event: TimelineEvent) => MoriMenuItemSpec[];
}) {
  const menu = useContextMenuPosition();
  const card = buildTurnCardModel(turn);
  const [activityOpen, setActivityOpen] = useState(false);
  const selectId = turnSelectId(turn);
  const compactActivity = density === "dense";
  const hasBadges =
    card.decisionIds.length > 0 ||
    card.issueIds.length > 0 ||
    (compactActivity && Boolean(card.activitySummary));

  const primaryEvent = turnPrimaryEvent(turn);
  const menuItems = primaryEvent ? eventMenuItems?.(primaryEvent) : undefined;

  return (
    <article
      className={`conversation-turn-card is-${density} ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <button
        type="button"
        className="conversation-turn-main"
        onClick={() => onSelect(selectId)}
        onContextMenu={menuItems ? menu.onContextMenu : undefined}
        onKeyDown={menuItems ? menu.onKeyDown : undefined}
      >
        <span className="conversation-turn-head">
          <span className="conversation-turn-time">{formatTime(card.start)}</span>
          {card.tokenUsage ? (
            <span
              className="conversation-turn-tokens"
              title={
                card.tokenUsage.model
                  ? `${card.tokenUsage.model} · 입력 ${card.tokenUsage.input.toLocaleString()} · 출력 ${card.tokenUsage.output.toLocaleString()}`
                  : `입력 ${card.tokenUsage.input.toLocaleString()} · 출력 ${card.tokenUsage.output.toLocaleString()}`
              }
            >
              {formatTokens(card.tokenUsage.total)} 토큰
            </span>
          ) : null}
        </span>

        {card.ask ? (
          <span className="conversation-turn-ask">
            <span className="conversation-turn-role">
              <User size={12} aria-hidden="true" /> 사용자
            </span>
            <span className="conversation-turn-ask-text">{card.ask}</span>
          </span>
        ) : null}

        {card.reply ? (
          <span className="conversation-turn-reply">
            <span className="conversation-turn-role">
              <Sparkles size={12} aria-hidden="true" /> Claude
            </span>
            <span className="conversation-turn-reply-text">{card.reply}</span>
          </span>
        ) : null}

        {card.fallback ? (
          <span className="conversation-turn-reply-text is-fallback">{card.fallback}</span>
        ) : null}

        {hasBadges ? (
          <span className="conversation-turn-badges">
            {card.decisionIds.length > 0 ? (
              <span className="conversation-turn-badge is-decision">
                결정 {card.decisionIds.length}
              </span>
            ) : null}
            {card.issueIds.length > 0 ? (
              <span className="conversation-turn-badge is-issue">
                이슈 {card.issueIds.length}
              </span>
            ) : null}
            {compactActivity && card.activitySummary ? (
              <span className="conversation-turn-badge is-activity">
                <Terminal size={11} aria-hidden="true" />
                {card.activitySummary}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>

      {card.activitySummary && !compactActivity ? (
        <ActivityStrip card={card} open={activityOpen} onToggle={() => setActivityOpen((v) => !v)} />
      ) : null}
      {primaryEvent && menuItems ? (
        <MoriContextMenu
          open={menu.open}
          position={menu.position}
          items={menuItems}
          onClose={menu.close}
          label={`${primaryEvent.title} 작업`}
        />
      ) : null}
    </article>
  );
}

/** Collapsible muted strip of a turn's tool calls + file edits. */
function ActivityStrip({
  card,
  open,
  onToggle,
}: {
  card: TurnCardModel;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="conversation-turn-activity">
      <button
        type="button"
        className="conversation-turn-activity-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown size={13} aria-hidden="true" />
        ) : (
          <ChevronRight size={13} aria-hidden="true" />
        )}
        <Terminal size={12} aria-hidden="true" />
        <span>{card.activitySummary}</span>
      </button>
      {open ? (
        <ol className="conversation-turn-activity-list">
          {card.activity.map((item) => (
            <li key={item.id} className="conversation-turn-activity-item">
              <span
                className={`conversation-turn-activity-label ${
                  item.isFileEdit ? "is-file" : "is-tool"
                }`}
              >
                {item.isFileEdit ? (
                  <FileEdit size={11} aria-hidden="true" />
                ) : (
                  <Terminal size={11} aria-hidden="true" />
                )}
                {item.label}
              </span>
              <span className="conversation-turn-activity-detail">{item.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * A burst — a tight run of tool turns. Renders with a VISIBLE criterion
 * ("3분 내 도구 호출 7회") so the grouping rule is on the card, never hidden.
 * Distinct from an overflow disclosure by design.
 */
function BurstGroup({
  burst,
  selectedItemId,
  onSelect,
  density,
  eventMenuItems,
}: {
  burst: TurnGroupBurst;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
  density: TimelineDensity;
  eventMenuItems?: (event: TimelineEvent) => MoriMenuItemSpec[];
}) {
  const selectionInside = burst.turns.some((turn) => isTurnSelected(turn, selectedItemId));
  const [expanded, setExpanded] = useState(false);
  const open = expanded || selectionInside;

  return (
    <div className={`conversation-burst ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="conversation-burst-head"
        aria-expanded={open}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="conversation-burst-icon" aria-hidden="true">
          <Zap size={14} />
        </span>
        <span className="conversation-burst-body">
          <strong>도구 호출 묶음</strong>
          <span className="conversation-burst-criterion">{burst.criterion}</span>
        </span>
        <span className="conversation-burst-toggle">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open ? (
        <ol className="conversation-burst-members">
          {burst.turns.map((turn) => (
            <li key={turn.id}>
              <TurnCard
                turn={turn}
                selected={isTurnSelected(turn, selectedItemId)}
                onSelect={onSelect}
                density={density}
                eventMenuItems={eventMenuItems}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * Pure overflow disclosure — "이 아래 N개 더 보기". No criterion, no claim;
 * just reveals the hidden tail. Deliberately styled unlike a burst.
 */
function OverflowGroup({
  overflow,
  selectedItemId,
  onSelect,
  density,
  eventMenuItems,
}: {
  overflow: TurnGroupOverflow;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
  density: TimelineDensity;
  eventMenuItems?: (event: TimelineEvent) => MoriMenuItemSpec[];
}) {
  const selectionInside = overflow.turns.some((turn) => isTurnSelected(turn, selectedItemId));
  const [expanded, setExpanded] = useState(false);
  const open = expanded || selectionInside;

  if (open) {
    return (
      <ol className="conversation-overflow-revealed">
        {overflow.turns.map((turn) => (
          <li key={turn.id}>
            <TurnCard
              turn={turn}
              selected={isTurnSelected(turn, selectedItemId)}
              onSelect={onSelect}
              density={density}
              eventMenuItems={eventMenuItems}
            />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <button
      type="button"
      className="conversation-overflow-disclosure"
      aria-expanded={false}
      onClick={() => setExpanded(true)}
    >
      <ChevronDown size={13} aria-hidden="true" />
      <span>{overflow.label}</span>
    </button>
  );
}

/** The event id a turn selects — the assistant, then ask, then first member. */
function turnSelectId(turn: Turn): string {
  return (
    turn.assistant?.id ??
    turn.ask?.id ??
    turn.toolCalls[0]?.id ??
    turn.fileEdits[0]?.id ??
    turn.decisions[0]?.id ??
    turn.issues[0]?.id ??
    turn.id
  );
}

function turnPrimaryEvent(turn: Turn): TimelineEvent | null {
  return (
    turn.assistant ??
    turn.ask ??
    turn.toolCalls[0] ??
    turn.fileEdits[0] ??
    turn.decisions[0] ??
    turn.issues[0] ??
    null
  );
}

/** Whether the current selection lands on any member event of the turn. */
function isTurnSelected(turn: Turn, selectedItemId: string | null): boolean {
  if (selectedItemId == null) return false;
  if (turn.id === selectedItemId) return true;
  const members = [
    turn.ask,
    turn.assistant,
    ...turn.toolCalls,
    ...turn.fileEdits,
    ...turn.decisions,
    ...turn.issues,
  ];
  return members.some((event) => event?.id === selectedItemId);
}

function conversationGroupingOptions(density: TimelineDensity, turnCount: number) {
  if (density === "dense") {
    return {
      burstWindowMinutes: 2,
      minBurstTurns: 2,
      maxVisibleGroups: turnCount > 22 ? 18 : undefined,
    };
  }
  if (density === "compact") {
    return {
      burstWindowMinutes: 3,
      minBurstTurns: 3,
      maxVisibleGroups: turnCount > 30 ? 24 : undefined,
    };
  }
  return {
    burstWindowMinutes: 3,
    minBurstTurns: 3,
    maxVisibleGroups: turnCount > 42 ? 36 : undefined,
  };
}

/** Compact token total — 12,345 → "12.3k", under 1000 stays exact. */
function formatTokens(total: number): string {
  if (total < 1000) return String(total);
  return `${(total / 1000).toFixed(1)}k`;
}
