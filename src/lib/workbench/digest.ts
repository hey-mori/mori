/**
 * Turn the workbench's currently filtered view into a plain-markdown digest:
 * every matched event, grouped by session, under a heading that names the
 * active lens / search. This is how a cross-session review ("all decisions
 * across these five sessions") leaves the board as something the user can
 * paste into notes. Pure formatting, no clipboard or React, so it can be
 * tested directly; the view passes already-filtered events in.
 */

export interface DigestEvent {
  title: string;
  summary: string;
}

export interface DigestSession {
  title: string;
  source?: string | null;
  events: DigestEvent[];
}

export interface DigestOptions {
  /** Active lens label (e.g. "결정"); "전체" or empty means no lens scope. */
  lensLabel?: string;
  /** Active search text, shown in the heading when present. */
  needle?: string;
}

/** Total matched events across sessions that actually have any. */
export function digestTotal(sessions: DigestSession[]): number {
  return sessions.reduce((sum, session) => sum + session.events.length, 0);
}

/** Build the markdown digest. Sessions with no matched events are skipped. */
export function buildWorkbenchDigest(
  sessions: DigestSession[],
  options: DigestOptions = {},
): string {
  const withEvents = sessions.filter((session) => session.events.length > 0);
  const total = digestTotal(withEvents);

  const scope: string[] = [];
  if (options.lensLabel && options.lensLabel !== "전체") scope.push(options.lensLabel);
  if (options.needle && options.needle.trim()) scope.push(`"${options.needle.trim()}"`);

  const heading = scope.length ? `워크벤치 · ${scope.join(" · ")}` : "워크벤치";
  const lines: string[] = [`# ${heading}  (${withEvents.length}개 세션, ${total}건)`, ""];

  for (const session of withEvents) {
    lines.push(`## ${session.title}${session.source ? ` · ${session.source}` : ""}`);
    for (const event of session.events) {
      const summary = event.summary.trim();
      lines.push(summary ? `- ${event.title}: ${summary}` : `- ${event.title}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
