/**
 * Timeline data-source seam.
 *
 * The timeline currently reads a static, locally-composed session snapshot.
 * A `TimelineDataSource` is the abstraction a *live* transport (polling a
 * REST endpoint, an SSE stream, a websocket) plugs into later — without any
 * timeline component or store consumer having to change.
 *
 * Today only `createStaticMockDataSource` is wired: there is no backend, so
 * it never emits and the app behaves exactly as before. `createPollingDataSource`
 * is a complete, generic implementation kept ready for the day a real
 * endpoint exists — swapping the source at its single construction site is
 * the entire integration. An SSE variant would mirror the same interface
 * (open an `EventSource`, call `onUpdate` per message, close on unsubscribe).
 */

export type Unsubscribe = () => void;

export type TimelineDataSource<T> = {
  /** Synchronous current snapshot — used for first paint. */
  getSnapshot(): T;
  /**
   * Subscribe to snapshot updates. Returns an unsubscribe function; the
   * source stops any underlying work once its last listener leaves.
   */
  subscribe(onUpdate: (snapshot: T) => void): Unsubscribe;
};

/**
 * A source backed by one fixed snapshot. Never emits — `subscribe` is a
 * no-op. This is the only source wired today, so the timeline stays fully
 * static until a real transport replaces it.
 */
export function createStaticMockDataSource<T>(snapshot: T): TimelineDataSource<T> {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  };
}

/**
 * Polling source — a drop-in for a real REST endpoint. Calls `fetchSnapshot`
 * every `intervalMs` while it has listeners, emitting only when the snapshot
 * actually changes (per `isEqual`, reference equality by default). Polling
 * starts on the first subscriber and stops when the last one leaves.
 *
 * Not constructed anywhere today — there is no backend — but fully working
 * so the seam is proven, not theoretical.
 */
export function createPollingDataSource<T>(options: {
  initial: T;
  fetchSnapshot: () => Promise<T>;
  intervalMs: number;
  isEqual?: (a: T, b: T) => boolean;
}): TimelineDataSource<T> {
  let current = options.initial;
  const isEqual = options.isEqual ?? Object.is;
  const listeners = new Set<(snapshot: T) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll(): Promise<void> {
    try {
      const next = await options.fetchSnapshot();
      if (isEqual(current, next)) return;
      current = next;
      for (const listener of listeners) listener(current);
    } catch {
      // Transient fetch failure — keep the last good snapshot and retry on
      // the next tick rather than tearing the timeline down.
    }
  }

  return {
    getSnapshot: () => current,
    subscribe(onUpdate) {
      listeners.add(onUpdate);
      if (timer === null) {
        timer = setInterval(() => void poll(), Math.max(1000, options.intervalMs));
      }
      return () => {
        listeners.delete(onUpdate);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
  };
}
