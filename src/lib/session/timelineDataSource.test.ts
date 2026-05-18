import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPollingDataSource,
  createStaticMockDataSource,
} from "./timelineDataSource";

describe("createStaticMockDataSource", () => {
  it("returns the fixed snapshot and never emits", () => {
    const snapshot = { value: 1 };
    const source = createStaticMockDataSource(snapshot);
    expect(source.getSnapshot()).toBe(snapshot);

    const onUpdate = vi.fn();
    const unsubscribe = source.subscribe(onUpdate);
    unsubscribe();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("createPollingDataSource", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits only when the polled snapshot changes", async () => {
    vi.useFakeTimers();
    const snapshots = [{ n: 1 }, { n: 1 }, { n: 2 }];
    let index = 0;
    const source = createPollingDataSource<{ n: number }>({
      initial: { n: 0 },
      intervalMs: 1000,
      fetchSnapshot: async () => snapshots[Math.min(index++, snapshots.length - 1)]!,
      isEqual: (a, b) => a.n === b.n,
    });

    const onUpdate = vi.fn();
    source.subscribe(onUpdate);

    await vi.advanceTimersByTimeAsync(1000); // n:1 — change from 0
    await vi.advanceTimersByTimeAsync(1000); // n:1 — no change
    await vi.advanceTimersByTimeAsync(1000); // n:2 — change

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(source.getSnapshot()).toEqual({ n: 2 });
  });

  it("stops polling once the last listener unsubscribes", async () => {
    vi.useFakeTimers();
    const fetchSnapshot = vi.fn(async () => ({ n: 1 }));
    const source = createPollingDataSource({
      initial: { n: 0 },
      intervalMs: 1000,
      fetchSnapshot,
    });

    const unsubscribe = source.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });
});
