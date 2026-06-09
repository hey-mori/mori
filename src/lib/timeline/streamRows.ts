import type { TimelineDisplayEvent, TimelineDisplayItem } from "./displayItems";

/**
 * A row in the 원본 (raw conversation stream): either a normal display item
 * (conversation turn, decision, file change, or an already-clustered bundle),
 * or a folded run of consecutive tool calls.
 */
export type StreamRow =
  | { kind: "item"; item: TimelineDisplayItem }
  | { kind: "toolRun"; id: string; events: TimelineDisplayEvent[]; tools: string[] };

function isToolEvent(item: TimelineDisplayItem): item is TimelineDisplayEvent {
  return item.kind === "event" && item.event.actor === "tool";
}

/**
 * Fold consecutive tool-call events into a single "tool run" so the stream reads
 * as the conversation with its tool activity tucked underneath, instead of every
 * Grep / Bash / Read competing as a peer row. Everything else — conversation
 * turns, decisions, file changes, and the bundles the model already clustered —
 * stays as its own row, in order.
 */
export function foldStreamRows(items: readonly TimelineDisplayItem[]): StreamRow[] {
  const rows: StreamRow[] = [];
  let run: TimelineDisplayEvent[] = [];

  const flush = () => {
    if (run.length === 0) return;
    rows.push({ kind: "toolRun", id: `toolrun-${run[0].id}`, events: run, tools: uniqueTools(run) });
    run = [];
  };

  for (const item of items) {
    if (isToolEvent(item)) {
      run.push(item);
    } else {
      flush();
      rows.push({ kind: "item", item });
    }
  }
  flush();
  return rows;
}

/** Distinct tool names in a run, first-seen order (e.g. ["Grep", "Bash"]). */
function uniqueTools(events: readonly TimelineDisplayEvent[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const event of events) {
    const name = event.event.toolName?.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
