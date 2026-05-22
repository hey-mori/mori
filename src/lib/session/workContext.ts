/**
 * Work-context derivation — the honest replacement for the old "ongoing
 * session" framing.
 *
 * Mori is not a recorder. The lower-left widget used to show a running
 * stopwatch and call every session "진행 중인 세션", which implied an
 * always-on recording. In reality a Mori session is a *bounded unit of
 * reconstructed work* — usually imported from a past Claude conversation,
 * sometimes started manually, and (in future) occasionally fed by a genuinely
 * live connector stream.
 *
 * `buildWorkContext` reframes a session into "what the user is currently
 * working with":
 *  - `imported` — reconstructed from external evidence (carries a `sourceLabel`
 *    such as the Claude project path). Shows the evidence *span*, never a
 *    stopwatch.
 *  - `manual` — a session the user started inside Mori to collect imports
 *    into. A container, not a recording — so still no stopwatch.
 *  - `demo` — the bundled sample session.
 *  - `live` — a genuinely live capture stream. Reserved for when a real
 *    connector pipeline exists; only this origin ever ticks.
 *
 * Because no live connector exists today, nothing ticks — which is the point.
 * Live capture is modelled as an *input flow* that produces evidence and
 * session candidates, not as a session that Mori "records".
 */
import { deriveSessionTiming, type DeriveSessionTimingInput } from "./sessionTiming";

export type WorkContextOrigin = "demo" | "imported" | "manual" | "live";

export type WorkContext = {
  origin: WorkContextOrigin;
  /** Short Korean label for the origin chip. */
  originLabel: string;
  /** Badge tone for the origin chip. */
  tone: "purple" | "green" | "orange" | "gray";
  /** Grouping label — the Claude project path for imported sessions. */
  projectLabel: string | null;
  /** The focused session's title. */
  sessionTitle: string;
  /**
   * Honest time descriptor. For imported / manual sessions this is the
   * *span* of the work ("2시간 45분" / "5월 21일"), never a running clock.
   * For a live capture it is the running duration.
   */
  timeDescriptor: string | null;
  /** Caption under the time, e.g. "분량" for a span or "캡처 중" for live. */
  timeCaption: string | null;
  /**
   * Whether the widget should tick a live clock. Only ever true for a
   * genuine `live` capture — false for demo, imported, and manual sessions.
   */
  isLive: boolean;
};

export function buildWorkContext(input: DeriveSessionTimingInput): WorkContext {
  const timing = deriveSessionTiming(input);
  const session = input.draft?.session ?? null;

  if (!session) {
    return {
      origin: "demo",
      originLabel: "데모",
      tone: "purple",
      projectLabel: null,
      sessionTitle: input.demoSession.title,
      timeDescriptor: spanLabel(input.demoSession.startedAt, input.demoSession.endedAt),
      timeCaption: "분량",
      isLive: false,
    };
  }

  const sourceLabel = session.sourceLabel?.trim() ? session.sourceLabel.trim() : null;

  // A genuinely live capture stream. Imported sessions are never live; a
  // live origin requires a connector actively emitting (not modelled yet),
  // so this branch is effectively dormant until that pipeline exists.
  if (timing.isLive && session.status === "recording" && sourceLabel === null && isLiveCaptureEnabled(input)) {
    return {
      origin: "live",
      originLabel: "라이브 캡처",
      tone: "green",
      projectLabel: null,
      sessionTitle: session.title,
      timeDescriptor: timing.durationLabel,
      timeCaption: "캡처 중",
      isLive: true,
    };
  }

  if (sourceLabel !== null) {
    return {
      origin: "imported",
      originLabel: "가져온 세션",
      tone: "gray",
      projectLabel: sourceLabel,
      sessionTitle: session.title,
      timeDescriptor: spanLabel(session.startedAt, session.endedAt),
      timeCaption: "분량",
      isLive: false,
    };
  }

  // Manual session — a container the user collects imports into. Surface the
  // analysis state honestly, but never as a recording stopwatch.
  if (timing.state === "analyzing") {
    return {
      origin: "manual",
      originLabel: "분석 중",
      tone: "orange",
      projectLabel: null,
      sessionTitle: session.title,
      timeDescriptor: spanLabel(session.startedAt, session.endedAt),
      timeCaption: "분량",
      isLive: false,
    };
  }

  return {
    origin: "manual",
    originLabel: "작업 세션",
    tone: "gray",
    projectLabel: null,
    sessionTitle: session.title,
    timeDescriptor: spanLabel(session.startedAt, session.endedAt),
    timeCaption: "분량",
    isLive: false,
  };
}

/**
 * Live capture is not implemented yet, so this always returns false today.
 * It is a single, named seam: when a real connector stream lands, flip this
 * to read an explicit capture flag rather than reintroducing a stopwatch by
 * accident. Kept as a function so the intent is greppable.
 */
function isLiveCaptureEnabled(_input: DeriveSessionTimingInput): boolean {
  return false;
}

/**
 * Korean label for the span between two ISO timestamps. Returns a duration
 * ("2시간 45분") when the span is meaningful, the start date ("5월 21일")
 * when start and end collapse to a point, or null when there is no usable
 * start. Never a running clock — this is a fixed descriptor of past work.
 */
export function spanLabel(startIso: string | undefined, endIso: string | undefined): string | null {
  const start = parseIso(startIso);
  if (start === null) return null;
  const end = parseIso(endIso);
  if (end === null || end <= start) {
    return formatDateLabel(start);
  }
  const diffMs = end - start;
  if (diffMs < 60_000) return "1분 미만";
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${days}일` : `${days}일 ${remHours}시간`;
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDateLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
