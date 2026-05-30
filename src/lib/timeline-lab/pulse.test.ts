import { describe, expect, it } from "vitest";
import { buildPulse } from "./pulse";
import { labDecision, labEvent, labIssue, labSession } from "./labFixture";

describe("buildPulse headline stats", () => {
  it("counts moments, decisions and issues", () => {
    const pulse = buildPulse(
      labSession({
        events: [labEvent({ id: "e1" }), labEvent({ id: "e2" }), labEvent({ id: "e3" })],
        decisions: [labDecision({ id: "d1" }), labDecision({ id: "d2" })],
        issues: [labIssue({ id: "i1" })],
      }),
    );
    expect(pulse.totalMoments).toBe(3);
    expect(pulse.decisionCount).toBe(2);
    expect(pulse.issues.total).toBe(1);
    const byId = Object.fromEntries(pulse.stats.map((s) => [s.id, s.value]));
    expect(byId.moments).toBe("3");
    expect(byId.decisions).toBe("2");
    expect(byId.issues).toBe("1");
  });

  it("reports an em-dash-free placeholder for duration when time is unknown", () => {
    const pulse = buildPulse(labSession({ events: [labEvent({ id: "e1", start: "bad" })] }));
    const duration = pulse.stats.find((s) => s.id === "duration");
    expect(pulse.durationLabel).toBeNull();
    expect(duration?.value).toBe("·");
    expect(duration?.detail).toBeNull();
  });
});

describe("buildPulse duration", () => {
  it("formats hours and minutes across the event span", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", start: "2026-05-22T09:00:00Z" }),
          labEvent({ id: "e2", start: "2026-05-22T11:30:00Z" }),
        ],
      }),
    );
    expect(pulse.durationLabel).toBe("2시간 30분");
    expect(pulse.spanLabel).toMatch(/–/);
  });

  it("drops the minutes segment on a whole-hour span", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", start: "2026-05-22T09:00:00Z" }),
          labEvent({ id: "e2", start: "2026-05-22T10:00:00Z" }),
        ],
      }),
    );
    expect(pulse.durationLabel).toBe("1시간");
  });

  it("uses minutes only under an hour", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", start: "2026-05-22T09:00:00Z" }),
          labEvent({ id: "e2", start: "2026-05-22T09:40:00Z" }),
        ],
      }),
    );
    expect(pulse.durationLabel).toBe("40분");
  });
});

describe("buildPulse issue resolution", () => {
  it("splits resolved from open and computes the percentage", () => {
    const pulse = buildPulse(
      labSession({
        issues: [
          labIssue({ id: "i1", status: "resolved" }),
          labIssue({ id: "i2", status: "resolved" }),
          labIssue({ id: "i3", status: "open" }),
          labIssue({ id: "i4", status: "watching" }),
        ],
      }),
    );
    expect(pulse.issues).toEqual({ open: 2, resolved: 2, total: 4, resolvedPct: 50 });
  });

  it("is all-zero with no issues", () => {
    const pulse = buildPulse(labSession({ issues: [] }));
    expect(pulse.issues).toEqual({ open: 0, resolved: 0, total: 0, resolvedPct: 0 });
  });
});

describe("buildPulse trust composition", () => {
  it("counts events by trust level and lists confirmed levels in order", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", trustLevel: "verified" }),
          labEvent({ id: "e2", trustLevel: "observed" }),
          labEvent({ id: "e3", trustLevel: "observed" }),
          labEvent({ id: "e4", trustLevel: "inferred" }),
        ],
      }),
    );
    expect(pulse.trust.map((t) => `${t.level}:${t.count}`)).toEqual([
      "verified:1",
      "observed:2",
      "inferred:1",
    ]);
    expect(pulse.trust.find((t) => t.level === "observed")?.pct).toBe(50);
  });

  it("omits trust levels with no events", () => {
    const pulse = buildPulse(
      labSession({ events: [labEvent({ id: "e1", trustLevel: "observed" })] }),
    );
    expect(pulse.trust.map((t) => t.level)).toEqual(["observed"]);
  });
});

describe("buildPulse phase distribution", () => {
  it("turns phase counts into percentages of all moments", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", type: "decision" }),
          labEvent({ id: "e2", type: "fileCode" }),
          labEvent({ id: "e3", type: "fileCode" }),
          labEvent({ id: "e4", type: "issue" }),
        ],
      }),
    );
    const byId = Object.fromEntries(pulse.phases.map((p) => [p.id, p.pct]));
    expect(byId.decide).toBe(25);
    expect(byId.build).toBe(50);
    expect(byId.verify).toBe(25);
    expect(pulse.phases.reduce((sum, p) => sum + p.count, 0)).toBe(4);
  });
});

describe("buildPulse momentum", () => {
  it("buckets events across the span and scales to the busiest bucket", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", start: "2026-05-22T09:00:00Z" }),
          labEvent({ id: "e2", start: "2026-05-22T09:01:00Z" }),
          labEvent({ id: "e3", start: "2026-05-22T09:02:00Z" }),
          labEvent({ id: "e4", start: "2026-05-22T18:00:00Z" }),
        ],
      }),
    );
    expect(pulse.momentum.length).toBeGreaterThan(0);
    const total = pulse.momentum.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(4);
    expect(Math.max(...pulse.momentum.map((b) => b.pct))).toBe(100);
  });

  it("marks a bucket pivotal when it holds a decision or issue event", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", type: "aiConversation", start: "2026-05-22T09:00:00Z" }),
          labEvent({ id: "e2", type: "decision", start: "2026-05-22T17:00:00Z" }),
        ],
        decisions: [labDecision({ id: "d1", sourceEventIds: ["e2"] })],
      }),
    );
    expect(pulse.momentum.some((b) => b.pivotal)).toBe(true);
  });

  it("returns no momentum when fewer than two timestamps parse", () => {
    const pulse = buildPulse(labSession({ events: [labEvent({ id: "e1" })] }));
    expect(pulse.momentum).toEqual([]);
  });
});

describe("buildPulse continuation", () => {
  it("carries open issues forward", () => {
    const pulse = buildPulse(
      labSession({
        issues: [
          labIssue({ id: "i1", status: "open" }),
          labIssue({ id: "i2", status: "resolved" }),
        ],
      }),
    );
    expect(pulse.continuation.openIssues.map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("buildPulse health meter", () => {
  it("reads grounded when most events are verified or observed", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", trustLevel: "verified" }),
          labEvent({ id: "e2", trustLevel: "observed" }),
          labEvent({ id: "e3", trustLevel: "verified" }),
          labEvent({ id: "e4", trustLevel: "inferred" }),
        ],
      }),
    );
    expect(pulse.health.groundedPct).toBe(75);
    expect(pulse.health.tone).toBe("green");
  });

  it("reads inference-heavy when most events are inferred", () => {
    const pulse = buildPulse(
      labSession({
        events: [
          labEvent({ id: "e1", trustLevel: "inferred" }),
          labEvent({ id: "e2", trustLevel: "inferred" }),
          labEvent({ id: "e3", trustLevel: "inferred" }),
          labEvent({ id: "e4", trustLevel: "verified" }),
        ],
      }),
    );
    expect(pulse.health.groundedPct).toBe(25);
    expect(pulse.health.tone).toBe("purple");
  });
});

describe("buildPulse confidence-aware emphasis", () => {
  it("mutes a stat when its items are mostly inferred", () => {
    const pulse = buildPulse(
      labSession({
        decisions: [
          labDecision({ id: "d1", trustLevel: "inferred" }),
          labDecision({ id: "d2", trustLevel: "inferred" }),
          labDecision({ id: "d3", trustLevel: "verified" }),
        ],
      }),
    );
    const decisions = pulse.stats.find((s) => s.id === "decisions");
    expect(decisions?.emphasis).toBe("muted");
  });

  it("keeps a stat at full emphasis when its items are grounded", () => {
    const pulse = buildPulse(
      labSession({
        decisions: [
          labDecision({ id: "d1", trustLevel: "verified" }),
          labDecision({ id: "d2", trustLevel: "observed" }),
        ],
      }),
    );
    const decisions = pulse.stats.find((s) => s.id === "decisions");
    expect(decisions?.emphasis).toBe("full");
    expect(pulse.stats.find((s) => s.id === "duration")?.emphasis).toBe("full");
  });
});

describe("buildPulse carry-forward prompt", () => {
  it("composes a resume prompt from the reviewed session", () => {
    const pulse = buildPulse(
      labSession({
        decisions: [labDecision({ id: "d1", title: "토큰 버킷 채택" })],
      }),
    );
    expect(typeof pulse.resumePrompt).toBe("string");
    expect(pulse.resumePrompt).toContain("토큰 버킷 채택");
  });
});
