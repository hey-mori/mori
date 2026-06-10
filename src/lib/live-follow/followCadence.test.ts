import { describe, expect, it } from "vitest";
import { decideFollowCadence } from "./followCadence";

describe("decideFollowCadence", () => {
  it("polls briskly while the session is still active (no silence yet)", () => {
    const decision = decideFollowCadence({ status: "following", msSinceLastActivity: 0 });
    expect(decision.nextDelayMs).toBe(4_000);
    expect(decision.shouldAutoStop).toBe(false);
  });

  it("stays at the active interval until the ramp starts", () => {
    const atRampStart = decideFollowCadence({ status: "following", msSinceLastActivity: 30_000 });
    expect(atRampStart.nextDelayMs).toBe(4_000);
  });

  it("backs off toward the idle interval as the silence grows", () => {
    const early = decideFollowCadence({ status: "following", msSinceLastActivity: 60_000 });
    const later = decideFollowCadence({ status: "following", msSinceLastActivity: 120_000 });
    // Monotonic backoff between the active and idle bounds.
    expect(early.nextDelayMs).toBeGreaterThan(4_000);
    expect(later.nextDelayMs).toBeGreaterThan(early.nextDelayMs);
    expect(later.nextDelayMs).toBeLessThan(30_000);
  });

  it("interpolates to the midpoint at the middle of the ramp", () => {
    // Halfway between rampStart (30s) and rampEnd (180s) is 105s.
    const mid = decideFollowCadence({ status: "following", msSinceLastActivity: 105_000 });
    expect(mid.nextDelayMs).toBe(Math.round((4_000 + 30_000) / 2));
  });

  it("settles at the idle interval once the silence passes the ramp end", () => {
    const decision = decideFollowCadence({ status: "following", msSinceLastActivity: 200_000 });
    expect(decision.nextDelayMs).toBe(30_000);
  });

  it("signals auto-stop once the silence exceeds the threshold", () => {
    const before = decideFollowCadence({ status: "following", msSinceLastActivity: 899_000 });
    const after = decideFollowCadence({ status: "following", msSinceLastActivity: 900_000 });
    expect(before.shouldAutoStop).toBe(false);
    expect(after.shouldAutoStop).toBe(true);
  });

  it("does not ramp or auto-stop when the follow is not active", () => {
    for (const status of ["idle", "paused", "stopped"] as const) {
      const decision = decideFollowCadence({ status, msSinceLastActivity: 1_000_000 });
      expect(decision.nextDelayMs).toBe(30_000);
      expect(decision.shouldAutoStop).toBe(false);
    }
  });

  it("clamps a misconfigured idle interval so backoff never speeds polling up", () => {
    const decision = decideFollowCadence(
      { status: "following", msSinceLastActivity: 1_000_000 },
      { activeIntervalMs: 5_000, idleIntervalMs: 1_000 },
    );
    // idle is clamped up to the active interval, never below it.
    expect(decision.nextDelayMs).toBe(5_000);
  });

  it("treats negative elapsed silence as zero", () => {
    const decision = decideFollowCadence({ status: "following", msSinceLastActivity: -5_000 });
    expect(decision.nextDelayMs).toBe(4_000);
  });
});
