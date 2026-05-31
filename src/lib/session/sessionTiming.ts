/**
 * Pure helpers for deriving session start, status, and elapsed-time labels.
 *
 * The sidebar session card and the Session Detail header both show "session
 * timing" information, but until this milestone the sidebar card was
 * hard-coded ("시작: 13:02 · 04:32:19") and the header showed
 * `startedAt → endedAt` regardless of whether the session was actually live.
 *
 * `deriveSessionTiming` is the single source of truth. It does not import the
 * session store; it accepts everything it needs as plain arguments so it can
 * be tested deterministically and reused from React or Rust-side helpers.
 */
import type { Session } from "../../domain/types";

export type SessionLifecycleState =
  | "demo"
  | "draft"
  | "active"
  | "analyzing"
  | "ended";

export type SessionTimingSnapshot = {
  /** Coarse lifecycle state, suitable for UI badges. */
  state: SessionLifecycleState;
  /** Human label for the state ("Demo", "Live", "Analyzing", "Ended"). */
  stateLabel: string;
  /** Visual tone for the badge. */
  stateTone: "purple" | "green" | "orange" | "gray";
  /** ISO start timestamp, or null when no session exists. */
  startIso: string | null;
  /**
   * ISO end timestamp. When the session is `active`, this is the same as
   * `nowIso` so callers can render a moving clock without leaking the demo's
   * baked-in `endedAt`.
   */
  endIso: string | null;
  /** Duration in seconds between start and end (active sessions: start→now). */
  durationSeconds: number;
  /** "HH:MM:SS" for the duration, padded so layout doesn't jitter. */
  durationLabel: string;
  /** "13:02" style start-time label, or null when start is missing. */
  startTimeLabel: string | null;
  /** "Demo: 0h 22m" / "Live · 04:32:19" / "Saved · 17m". */
  longLabel: string;
  /**
   * Whether the session is currently counting time forward. Sidebar uses this
   * to add the subtle pulse on the timer; tests use it as the canonical
   * "should I re-render every second" flag.
   */
  isLive: boolean;
};

export type DeriveSessionTimingInput = {
  /** Real persisted draft session, or null in demo mode. */
  draft: { session: Session } | null;
  /** Demo session — only used when `draft` is null. */
  demoSession: Session;
  /** Reported analysis status from the session store. */
  analysisStatus: "idle" | "running" | "succeeded" | "failed";
  /** `Date.now()` injection point for tests. Defaults to `Date.now()`. */
  now?: number;
};

/**
 * Produce a stable timing snapshot.
 *
 * - In demo mode the function returns the demo session's baked range without
 *   pretending the clock is moving.
 * - In draft mode with `session.status === "recording"` and an `endedAt`
 *   string that is either empty/missing OR in the future relative to `now`,
 *   we treat the session as live and bind `endIso` to `now`.
 * - When `analysisStatus === "running"` we surface a separate `analyzing`
 *   state so the badge doesn't claim the session is still recording.
 * - When the session ended in the past, we surface the stored duration
 *   verbatim so saved sessions feel deterministic.
 */
export function deriveSessionTiming(input: DeriveSessionTimingInput): SessionTimingSnapshot {
  const now = input.now ?? Date.now();
  const draftSession = input.draft?.session ?? null;

  if (!draftSession) {
    // Demo mode: no live clock, no fake timer.
    const startMs = parseIso(input.demoSession.startedAt);
    const endMs = parseIso(input.demoSession.endedAt);
    const durationSeconds = clampDurationSeconds(endMs, startMs);
    return {
      state: "demo",
      stateLabel: "Demo",
      stateTone: "purple",
      startIso: input.demoSession.startedAt || null,
      endIso: input.demoSession.endedAt || null,
      durationSeconds,
      durationLabel: formatDuration(durationSeconds),
      startTimeLabel: formatStartTime(input.demoSession.startedAt),
      longLabel: `Demo · ${formatLongDuration(durationSeconds)}`,
      isLive: false,
    };
  }

  const startMs = parseIso(draftSession.startedAt);
  const storedEndMs = parseIso(draftSession.endedAt);
  // `createSessionDraft` seeds `endedAt` with the creation timestamp as a
  // placeholder, so a freshly-started session has `endedAt === startedAt`.
  // That is not a genuine end — without this guard the session card would
  // label a just-started session "Saved" and freeze the clock at 00:00:00.
  // A real end is a stored timestamp that is strictly after the start and
  // not in the future.
  const hasGenuineEnd =
    storedEndMs !== null &&
    startMs !== null &&
    storedEndMs > startMs &&
    storedEndMs <= now;
  const isLive =
    input.analysisStatus !== "running" &&
    draftSession.status === "recording" &&
    !hasGenuineEnd;
  const isAnalyzing = input.analysisStatus === "running" || draftSession.status === "analyzing";

  const effectiveEndMs = isLive ? now : storedEndMs ?? now;
  const durationSeconds = clampDurationSeconds(effectiveEndMs, startMs);

  if (isAnalyzing) {
    return {
      state: "analyzing",
      stateLabel: "Analyzing",
      stateTone: "orange",
      startIso: draftSession.startedAt || null,
      endIso: new Date(effectiveEndMs).toISOString(),
      durationSeconds,
      durationLabel: formatDuration(durationSeconds),
      startTimeLabel: formatStartTime(draftSession.startedAt),
      longLabel: `Analyzing · ${formatLongDuration(durationSeconds)}`,
      isLive: false,
    };
  }

  if (isLive) {
    return {
      state: "active",
      stateLabel: "Live",
      stateTone: "green",
      startIso: draftSession.startedAt || null,
      endIso: new Date(effectiveEndMs).toISOString(),
      durationSeconds,
      durationLabel: formatDuration(durationSeconds),
      startTimeLabel: formatStartTime(draftSession.startedAt),
      longLabel: `Live · ${formatDuration(durationSeconds)}`,
      isLive: true,
    };
  }

  // Saved / ended session.
  return {
    state: draftSession.status === "complete" ? "ended" : "draft",
    stateLabel: draftSession.status === "complete" ? "Ended" : "Saved",
    stateTone: "gray",
    startIso: draftSession.startedAt || null,
    endIso: draftSession.endedAt || null,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    startTimeLabel: formatStartTime(draftSession.startedAt),
    longLabel: draftSession.status === "complete"
      ? `Ended · ${formatLongDuration(durationSeconds)}`
      : `Saved · ${formatLongDuration(durationSeconds)}`,
    isLive: false,
  };
}

/**
 * The primary action the sidebar session card should offer for a given
 * lifecycle state. An ongoing session can be ended; a finished or demo
 * session has nothing to end, so the card points the user at the report
 * instead — keeping the card a live entry point rather than a dead end.
 */
export type SessionCardAction = {
  kind: "endSession" | "viewReport";
  label: string;
};

export function describeSessionCardAction(
  state: SessionLifecycleState,
): SessionCardAction {
  if (state === "active" || state === "analyzing" || state === "draft") {
    return { kind: "endSession", label: "세션 종료" };
  }
  return { kind: "viewReport", label: "보고서 보기" };
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function clampDurationSeconds(end: number | null, start: number | null): number {
  if (start === null || end === null) return 0;
  const diff = Math.max(0, end - start);
  return Math.floor(diff / 1000);
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

export function formatLongDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return `${safe}s`;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${pad(minutes)}m`;
}

function formatStartTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
