/**
 * Turn-card view model.
 *
 * The flow view renders one imported/captured turn as one card: the initiating
 * activity, an assistant/source response when present, and a collapsible muted
 * strip of mechanical tool calls + file edits.
 * `buildTurns` produces the structural `Turn`; this derives the *renderable*
 * shape — the strings, labels, counts, and badges the card draws — so the
 * React component stays a thin renderer and the derivation is unit-testable.
 *
 * No React, no domain mutation. Pure.
 */
import type { EventActor, TimelineEvent } from "../../domain/types";
import { inferActorFallback } from "./buildTurns";
import type { Turn } from "./buildTurns";

const NO_RESPONSE = "(no response captured)";

/** One entry in a turn's collapsible tool / file strip. */
export type TurnActivityItem = {
  id: string;
  /** Display label — the tool name when known, else a kind word. */
  label: string;
  /** Detail line (the event title/summary), already compacted. */
  detail: string;
  /** Whether this entry is a file edit (vs a tool call). */
  isFileEdit: boolean;
};

/** Compact token-usage figures for the card, when the turn reported any. */
export type TurnTokenUsage = {
  input: number;
  output: number;
  total: number;
  model?: string;
};

/** Everything the turn card needs to render, derived from a `Turn`. */
export type TurnCardModel = {
  id: string;
  /** Earliest member start — drives the card's timestamp. */
  start: string;
  /** The user's ask, prominent. Null when the turn opens with no human ask. */
  ask: string | null;
  /** Assistant/source reply. Null when the turn captured no answer. */
  reply: string | null;
  /**
   * When the turn has neither a usable ask nor a reply (a bare tool / system
   * turn), this carries a single line so the card is never blank.
   */
  fallback: string | null;
  /** Collapsible activity strip — tool calls then file edits, in that order. */
  activity: TurnActivityItem[];
  /** Count of tool calls in the strip. */
  toolCount: number;
  /** Count of file edits in the strip. */
  fileCount: number;
  /**
   * One-line summary of the strip for the collapsed state, e.g.
   * `"도구 7 · 파일 3"`. Null when there is no activity to collapse.
   */
  activitySummary: string | null;
  /** Token usage from the assistant member, when present. */
  tokenUsage: TurnTokenUsage | null;
  /** Distinct decision ids linked across the turn's members. */
  decisionIds: string[];
  /** Distinct issue ids linked across the turn's members. */
  issueIds: string[];
};

/** Derive the renderable card model for a single turn. */
export function buildTurnCardModel(turn: Turn): TurnCardModel {
  const askEvent = turn.ask ?? null;
  // Today one imported turn is a single paired event whose `title` is the user
  // ask and `summary` is the assistant/source reply; that event lands in `assistant` (or,
  // for a tool-only turn, `toolCalls`) by its actor, leaving `ask` null. So the
  // human ask is read from whichever member carries it, preferring an explicit
  // `ask` slot, then the assistant reply event, then the first tool call.
  const replyEvent = turn.assistant ?? null;

  const askText =
    cleanText(askEvent?.title) ??
    cleanText(replyEvent?.title) ??
    cleanText(turn.toolCalls[0]?.title) ??
    null;

  const replyText = (() => {
    if (!replyEvent) return null;
    const actor = resolveActor(replyEvent);
    // A tool-actor reply belongs in the activity strip, not the reply slot.
    if (actor === "tool") return null;
    const summary = cleanText(replyEvent.summary);
    // Do not echo the ask as the reply when they are the same string.
    if (summary && summary !== askText) return summary;
    return null;
  })();

  const activity = buildActivity(turn);
  const toolCount = activity.filter((item) => !item.isFileEdit).length;
  const fileCount = activity.filter((item) => item.isFileEdit).length;

  const fallback =
    askText === null && replyText === null && activity.length === 0
      ? cleanText(replyEvent?.summary) ??
        cleanText(askEvent?.summary) ??
        "내용 없음"
      : null;

  return {
    id: turn.id,
    start: earliestStart(turn),
    ask: askText,
    reply: replyText,
    fallback,
    activity,
    toolCount,
    fileCount,
    activitySummary: summarizeActivity(toolCount, fileCount),
    tokenUsage: extractTokenUsage(turn),
    decisionIds: collectLinkedIds(turn, "linkedDecisionIds"),
    issueIds: collectLinkedIds(turn, "linkedIssueIds"),
  };
}

/** The tool calls + file edits of a turn, as labelled strip entries. */
function buildActivity(turn: Turn): TurnActivityItem[] {
  const items: TurnActivityItem[] = [];

  // A tool-actor reply is mechanical activity, not an answer — surface it in
  // the strip alongside the explicit tool-call members.
  const replyAsTool =
    turn.assistant && resolveActor(turn.assistant) === "tool" ? turn.assistant : null;
  const toolEvents = replyAsTool ? [replyAsTool, ...turn.toolCalls] : turn.toolCalls;

  for (const event of toolEvents) {
    items.push({
      id: event.id,
      label: event.toolName?.trim() || "도구",
      detail: cleanText(event.summary) ?? cleanText(event.title) ?? "도구 활동",
      isFileEdit: false,
    });
  }
  for (const event of turn.fileEdits) {
    items.push({
      id: event.id,
      label: "파일",
      detail: cleanText(event.title) ?? cleanText(event.summary) ?? "파일 변경",
      isFileEdit: true,
    });
  }
  return items;
}

/** `"도구 7 · 파일 3"`, omitting a zero side; null when both are zero. */
function summarizeActivity(toolCount: number, fileCount: number): string | null {
  const parts: string[] = [];
  if (toolCount > 0) parts.push(`도구 ${toolCount}`);
  if (fileCount > 0) parts.push(`파일 ${fileCount}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Token usage carried by the assistant member, if any. */
function extractTokenUsage(turn: Turn): TurnTokenUsage | null {
  const usage = turn.assistant?.tokenUsage;
  if (!usage) return null;
  return {
    input: usage.input,
    output: usage.output,
    total: usage.total,
    model: usage.model,
  };
}

/** Distinct linked ids across every member of the turn, first-seen order. */
function collectLinkedIds(
  turn: Turn,
  field: "linkedDecisionIds" | "linkedIssueIds",
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const event of allMembers(turn)) {
    for (const id of event[field]) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

function allMembers(turn: Turn): TimelineEvent[] {
  return [
    turn.ask,
    turn.assistant,
    ...turn.toolCalls,
    ...turn.fileEdits,
    ...turn.decisions,
    ...turn.issues,
  ].filter((event): event is TimelineEvent => event !== null);
}

function earliestStart(turn: Turn): string {
  const members = allMembers(turn);
  if (members.length === 0) return "";
  return members.reduce(
    (earliest, event) => (event.start < earliest ? event.start : earliest),
    members[0]!.start,
  );
}

function resolveActor(event: TimelineEvent): EventActor {
  return event.actor ?? inferActorFallback(event);
}

/** Trim, drop the "no response" sentinel, and treat empties as absent. */
function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === NO_RESPONSE) return null;
  return trimmed;
}
