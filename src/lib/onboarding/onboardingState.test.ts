import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING_STATE,
  markOnboardingCompleted,
  parseOnboardingState,
  serializeOnboardingState,
} from "./onboardingState";

describe("onboardingState", () => {
  it("defaults to not-completed on empty input", () => {
    expect(parseOnboardingState(null)).toEqual(DEFAULT_ONBOARDING_STATE);
  });

  it("round-trips a completed state", () => {
    const completed = markOnboardingCompleted("2026-07-12T00:00:00.000Z");
    const parsed = parseOnboardingState(serializeOnboardingState(completed));
    expect(parsed.completed).toBe(true);
    expect(parsed.dismissedAt).toBe("2026-07-12T00:00:00.000Z");
  });

  it("resets on a wrong schema version instead of trusting it", () => {
    const raw = JSON.stringify({ schemaVersion: 99, completed: true });
    expect(parseOnboardingState(raw)).toEqual(DEFAULT_ONBOARDING_STATE);
  });

  it("coerces a non-boolean completed to false and a bad timestamp to null", () => {
    const raw = JSON.stringify({ schemaVersion: 1, completed: "yes", dismissedAt: 5 });
    const parsed = parseOnboardingState(raw);
    expect(parsed.completed).toBe(false);
    expect(parsed.dismissedAt).toBeNull();
  });

  it("survives corrupted JSON", () => {
    expect(parseOnboardingState("{broken")).toEqual(DEFAULT_ONBOARDING_STATE);
  });
});
