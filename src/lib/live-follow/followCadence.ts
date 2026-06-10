/**
 * Live Follow cadence — the pure policy for WHEN the foreground poller should
 * poll next, and when it should give up.
 *
 * The driver (`runFollowPoll`) runs exactly one poll. Something has to decide
 * the delay until the next one. A fixed interval is wrong in both directions:
 * too fast and Mori re-reads a possibly-large connector JSONL every few seconds
 * while a session sits idle; too slow and a burst of new events shows up late.
 * So the cadence adapts to how long the followed session has been silent — brisk
 * right after activity, backing off toward a relaxed interval as the quiet
 * grows, and signalling `shouldAutoStop` once the silence is long enough that
 * the session has almost certainly ended.
 *
 * Pure and stateless: the foreground shell tracks WHEN it last saw new events
 * (a poll with `importedCount > 0`) and passes the elapsed silence in. No timer,
 * file system, or store. Foreground only, per the Live Follow doctrine.
 */
import type { FollowStatus } from "./followController";

export type FollowCadenceOptions = {
  /** Poll interval right after activity, while events are still flowing. */
  activeIntervalMs?: number;
  /** Relaxed poll interval once the session has gone quiet. */
  idleIntervalMs?: number;
  /** Silence below this stays at the active interval (no backoff yet). */
  rampStartMs?: number;
  /** Silence at/above this uses the idle interval; between, it interpolates. */
  rampEndMs?: number;
  /** Silence beyond this means the session has almost certainly ended. */
  autoStopAfterMs?: number;
};

export type FollowCadenceInput = {
  status: FollowStatus;
  /** Elapsed time since the last poll that found new events, in ms. */
  msSinceLastActivity: number;
};

export type FollowCadenceDecision = {
  /** Delay until the next poll should run, in ms. */
  nextDelayMs: number;
  /** True once the silence has exceeded `autoStopAfterMs` — the shell may stop
   *  following because the session looks finished. */
  shouldAutoStop: boolean;
};

const DEFAULTS: Required<FollowCadenceOptions> = {
  activeIntervalMs: 4_000,
  idleIntervalMs: 30_000,
  rampStartMs: 30_000,
  rampEndMs: 180_000,
  autoStopAfterMs: 900_000,
};

/**
 * Decide the next poll delay and whether to auto-stop, from how long the
 * followed session has been silent. Only an actively-following session ramps;
 * a paused / stopped / idle follow returns the relaxed interval and never
 * auto-stops (the shell is not polling it anyway).
 */
export function decideFollowCadence(
  input: FollowCadenceInput,
  options: FollowCadenceOptions = {},
): FollowCadenceDecision {
  const active = Math.max(250, options.activeIntervalMs ?? DEFAULTS.activeIntervalMs);
  // The idle interval can never be brisker than the active one, however the
  // caller configures it — backoff only ever slows polling down.
  const idle = Math.max(active, options.idleIntervalMs ?? DEFAULTS.idleIntervalMs);
  const rampStart = Math.max(0, options.rampStartMs ?? DEFAULTS.rampStartMs);
  // The ramp must have positive width so the interpolation never divides by zero.
  const rampEnd = Math.max(rampStart + 1, options.rampEndMs ?? DEFAULTS.rampEndMs);
  const autoStopAfter = Math.max(0, options.autoStopAfterMs ?? DEFAULTS.autoStopAfterMs);

  const silence = Math.max(0, input.msSinceLastActivity);

  if (input.status !== "following") {
    return { nextDelayMs: idle, shouldAutoStop: false };
  }

  let nextDelayMs: number;
  if (silence <= rampStart) {
    nextDelayMs = active;
  } else if (silence >= rampEnd) {
    nextDelayMs = idle;
  } else {
    const progress = (silence - rampStart) / (rampEnd - rampStart);
    nextDelayMs = Math.round(active + (idle - active) * progress);
  }

  return { nextDelayMs, shouldAutoStop: silence >= autoStopAfter };
}
