/**
 * Group conversation turns into an honest, legible reading list.
 *
 * The old timeline conflated two unrelated things under one "묶음" card: a
 * *meaningful* run of rapid same-actor activity (七 tool calls inside three
 * minutes) and a *mechanical* "this list is long, here are the rest" cut. They
 * looked identical, so the user could never tell whether a card meant "Claude
 * did a tight burst of work here" or merely "scroll for more".
 *
 * `groupTurns` separates them into two grouping kinds that the flow view MUST
 * render differently:
 *
 *   - **burst** — a run of consecutive turns that are the same kind of activity
 *     (today: tool calls) packed into a tight time window. Carries a *visible
 *     criterion* (`"3분 내 도구 호출 7회"`) so the grouping rule is on the card,
 *     never hidden. A burst is a real observation about the conversation.
 *
 *   - **overflow** — pure disclosure. When the readable list is longer than the
 *     caller wants to show at once, the tail folds into a single "이 아래 N개 더
 *     보기" group with no claim attached. It is a UI affordance, not an
 *     observation, and must look distinct from a burst.
 *
 *   - **turn** — a single turn shown on its own, untouched.
 *
 * Pure derivation over `Turn[]` (see `buildTurns`): no React, no domain
 * mutation, fully unit-testable.
 */
import type { EventActor, TimelineEvent } from "../../domain/types";
import { inferActorFallback } from "./buildTurns";
import type { Turn } from "./buildTurns";

/** A single turn, surfaced on its own row. */
export type TurnGroupTurn = {
  kind: "turn";
  /** Stable id (`turn.id`). */
  id: string;
  turn: Turn;
};

/**
 * A run of consecutive same-activity turns inside a tight window. The grouping
 * criterion is explicit and human-facing — the card shows `criterion`, so the
 * user can always see *why* these turns were collapsed.
 */
export type TurnGroupBurst = {
  kind: "burst";
  /** Stable id derived from the first + last member turn ids. */
  id: string;
  /** The turns folded into this burst, in order. */
  turns: Turn[];
  /** The activity the burst is made of — today always tool calls. */
  activity: "tool";
  /** Number of member turns. */
  count: number;
  /** Number of distinct tool calls across the burst (the headline figure). */
  toolCallCount: number;
  /** Span of the burst in whole minutes (0 when sub-minute). */
  spanMinutes: number;
  /** Human-facing criterion, e.g. `"3분 내 도구 호출 7회"`. Shown on the card. */
  criterion: string;
};

/**
 * Pure overflow disclosure: the tail of a long list, folded behind a single
 * "show N more" group. No criterion, no claim — just "there are more rows
 * below". Distinct kind so the view never styles it like a burst.
 */
export type TurnGroupOverflow = {
  kind: "overflow";
  id: string;
  /** The hidden turns, in order. */
  turns: Turn[];
  /** Number of hidden turns. */
  count: number;
  /** Human-facing disclosure label, e.g. `"이 아래 12개 더 보기"`. */
  label: string;
};

export type TurnGroup = TurnGroupTurn | TurnGroupBurst | TurnGroupOverflow;

export type GroupTurnsOptions = {
  /**
   * Minutes within which consecutive same-activity turns count as one burst.
   * Two adjacent tool turns join the same burst when their start times are no
   * more than this far apart. Defaults to 3.
   */
  burstWindowMinutes?: number;
  /**
   * Minimum number of consecutive tool turns before they collapse into a
   * burst. Below this they stay as individual turns — a lone tool call is not
   * a burst. Defaults to 3.
   */
  minBurstTurns?: number;
  /**
   * Maximum number of top-level groups to show before the remainder folds into
   * a single overflow disclosure. `undefined` (the default) means never
   * overflow — show everything.
   */
  maxVisibleGroups?: number;
};

const DEFAULTS = {
  burstWindowMinutes: 3,
  minBurstTurns: 3,
} as const;

/**
 * Fold a turn list into burst / overflow / single-turn groups.
 *
 * Two passes, in order, so the two concerns never blur:
 *   1. **Bursts** — scan for runs of consecutive tool-dominated turns within
 *      the burst window and collapse each qualifying run into one burst group
 *      carrying its visible criterion. Non-tool turns and short runs pass
 *      through as plain turns.
 *   2. **Overflow** — if `maxVisibleGroups` is set and the post-burst list is
 *      longer, the tail beyond the limit folds into one overflow group. The
 *      overflow group counts as the final visible slot.
 */
export function groupTurns(
  turns: readonly Turn[],
  opts: GroupTurnsOptions = {},
): TurnGroup[] {
  const burstWindowMinutes = opts.burstWindowMinutes ?? DEFAULTS.burstWindowMinutes;
  const minBurstTurns = opts.minBurstTurns ?? DEFAULTS.minBurstTurns;

  const withBursts = foldBursts(turns, { burstWindowMinutes, minBurstTurns });
  return foldOverflow(withBursts, opts.maxVisibleGroups);
}

/** Pass 1 — collapse tight runs of tool turns into burst groups. */
function foldBursts(
  turns: readonly Turn[],
  opts: { burstWindowMinutes: number; minBurstTurns: number },
): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let run: Turn[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    if (run.length >= opts.minBurstTurns) {
      groups.push(makeBurst(run, opts.burstWindowMinutes));
    } else {
      // A run too short to be a burst is honest as individual turns — never a
      // group, because a "묶음" of two would be a claim the data does not back.
      for (const turn of run) groups.push({ kind: "turn", id: turn.id, turn });
    }
    run = [];
  };

  for (const turn of turns) {
    if (!isToolTurn(turn)) {
      flushRun();
      groups.push({ kind: "turn", id: turn.id, turn });
      continue;
    }
    if (run.length === 0) {
      run = [turn];
      continue;
    }
    const previous = run[run.length - 1]!;
    if (minutesBetween(turnStart(previous), turnStart(turn)) <= opts.burstWindowMinutes) {
      run.push(turn);
    } else {
      // Same activity, but the gap broke the window — the previous run ends
      // here and a new one begins, so two separate bursts never merge across a
      // lull.
      flushRun();
      run = [turn];
    }
  }
  flushRun();

  return groups;
}

/** Pass 2 — fold the tail past `maxVisibleGroups` into one overflow group. */
function foldOverflow(groups: TurnGroup[], maxVisibleGroups?: number): TurnGroup[] {
  if (maxVisibleGroups === undefined) return groups;
  if (maxVisibleGroups < 1) return groups;
  if (groups.length <= maxVisibleGroups) return groups;

  // The overflow group itself occupies the last visible slot, so keep
  // `maxVisibleGroups - 1` real groups ahead of it.
  const keep = Math.max(0, maxVisibleGroups - 1);
  const visible = groups.slice(0, keep);
  const hiddenGroups = groups.slice(keep);
  const hiddenTurns = hiddenGroups.flatMap(turnsOfGroup);
  if (hiddenTurns.length === 0) return groups;

  visible.push({
    kind: "overflow",
    id: `overflow::${hiddenTurns[0]!.id}::${hiddenTurns[hiddenTurns.length - 1]!.id}`,
    turns: hiddenTurns,
    count: hiddenTurns.length,
    label: `이 아래 ${hiddenTurns.length}개 더 보기`,
  });
  return visible;
}

/** Build a burst group with its visible, human-facing criterion. */
function makeBurst(turns: Turn[], burstWindowMinutes: number): TurnGroupBurst {
  const first = turns[0]!;
  const last = turns[turns.length - 1]!;
  const toolCallCount = turns.reduce(
    (sum, turn) => sum + Math.max(1, turn.toolCalls.length),
    0,
  );
  const spanMinutes = Math.round(minutesBetween(turnStart(first), turnStart(last)));
  // The window the run actually fit inside drives the wording: a 7-call run
  // that fit in 3 minutes reads "3분 내 도구 호출 7회". When the real span is
  // tighter than the window, the span is the more honest number.
  const windowLabel = spanMinutes > 0 ? spanMinutes : burstWindowMinutes;
  return {
    kind: "burst",
    id: `burst::${first.id}::${last.id}`,
    turns,
    activity: "tool",
    count: turns.length,
    toolCallCount,
    spanMinutes,
    criterion: `${windowLabel}분 내 도구 호출 ${toolCallCount}회`,
  };
}

/**
 * Whether a turn reads as pure tool activity: it carries tool calls but no
 * user ask and no distinct assistant reply. A turn where Claude actually
 * answered is conversation, never a burst member, even if it also ran tools.
 */
function isToolTurn(turn: Turn): boolean {
  if (turn.ask) return false;
  if (turn.assistant && resolveActor(turn.assistant) === "assistant") return false;
  if (turn.decisions.length > 0 || turn.issues.length > 0) return false;
  const hasToolCalls =
    turn.toolCalls.length > 0 ||
    (turn.assistant !== null && resolveActor(turn.assistant) === "tool");
  return hasToolCalls;
}

/** Resolve a member event's actor, reconstructing it for legacy events. */
function resolveActor(event: TimelineEvent): EventActor {
  return event.actor ?? inferActorFallback(event);
}

/** Representative start time of a turn (earliest member event). */
function turnStart(turn: Turn): string {
  const members = [
    turn.ask,
    turn.assistant,
    ...turn.toolCalls,
    ...turn.fileEdits,
    ...turn.decisions,
    ...turn.issues,
  ].filter((event): event is TimelineEvent => event !== null);
  if (members.length === 0) return "";
  return members.reduce(
    (earliest, event) => (event.start < earliest ? event.start : earliest),
    members[0]!.start,
  );
}

/** All turns carried by any group kind, in order. */
function turnsOfGroup(group: TurnGroup): Turn[] {
  switch (group.kind) {
    case "turn":
      return [group.turn];
    case "burst":
    case "overflow":
      return group.turns;
  }
}

function minutesBetween(start: string, end: string): number {
  if (!start || !end) return Number.POSITIVE_INFINITY;
  return Math.abs(new Date(end).getTime() - new Date(start).getTime()) / 60000;
}
