import { describe, expect, it } from "vitest";
import { shouldPrewarm } from "./prewarm";

const MODEL = "qwen2.5:3b";
const MINUTE = 60_000;

describe("shouldPrewarm", () => {
  it("warms when nothing has been warmed yet", () => {
    expect(shouldPrewarm(MODEL, null, 0)).toBe(true);
  });

  it("does not warm a model that was just warmed", () => {
    // The whole point is to pay the load once.
    expect(shouldPrewarm(MODEL, { model: MODEL, at: 0 }, 1_000)).toBe(false);
  });

  it("warms a different model immediately", () => {
    // A model switch invalidates the warm one; the first request after the
    // switch must not be the one that pays for the new load.
    expect(shouldPrewarm("llama3.1:8b", { model: MODEL, at: 0 }, 1_000)).toBe(true);
  });

  it("warms again once the marker has gone stale", () => {
    // Without a TTL the marker outlives the model's residency and a later
    // request silently pays a cold load while we believe it is warm.
    expect(shouldPrewarm(MODEL, { model: MODEL, at: 0 }, 9 * MINUTE)).toBe(true);
  });

  it("expires before the keep_alive window, not after", () => {
    // keep_alive is 10 minutes. Expiring at or after that would mean the marker
    // is still trusted at the moment the model is being unloaded.
    expect(shouldPrewarm(MODEL, { model: MODEL, at: 0 }, 7 * MINUTE)).toBe(false);
    expect(shouldPrewarm(MODEL, { model: MODEL, at: 0 }, 10 * MINUTE)).toBe(true);
  });

  it("is stable across the exact boundary", () => {
    const eight = 8 * MINUTE;
    expect(shouldPrewarm(MODEL, { model: MODEL, at: 0 }, eight - 1)).toBe(false);
    expect(shouldPrewarm(MODEL, { model: MODEL, at: 0 }, eight)).toBe(true);
  });
});
