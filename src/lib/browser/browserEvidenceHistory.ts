import {
  browserEvidenceToTrace,
  type BrowserEvidenceCursor,
  type BrowserEvidencePageReader,
  type BrowserEvidenceRow,
} from "./browserEvidenceRepository";

export const BROWSER_HISTORY_PAGE_SIZE = 50;
export const BROWSER_HISTORY_WINDOW_SIZE = 500;

export type BrowserEvidenceHistoryItem = {
  /** React/read identity only, not a semantic event id. */
  key: string;
  kind: BrowserEvidenceRow["kind"];
  observedAt: string;
  receivedAt: string;
  provider: string;
  url: string | null;
  runtimeId: string | null;
  tabId: string;
  windowId: string | null;
  transitionType: string | null;
  transitionQualifiers: string[];
};

export function browserEvidenceToHistory(row: BrowserEvidenceRow): BrowserEvidenceHistoryItem {
  const { traceEvent } = browserEvidenceToTrace(row);
  return {
    key: String(row.sequence),
    kind: row.kind,
    observedAt: traceEvent.occurredAt,
    receivedAt: row.receivedAt,
    provider: traceEvent.metadata.runtime.provider,
    url: traceEvent.metadata.resource?.url ?? null,
    runtimeId: row.data.runtimeId,
    tabId: traceEvent.metadata.tab.runtimeTabId,
    windowId: row.data.windowId,
    transitionType: row.data.transitionType,
    transitionQualifiers: row.data.transitionQualifiers ?? [],
  };
}

export type BrowserEvidenceHistoryState = {
  items: BrowserEvidenceHistoryItem[];
  nextCursor: BrowserEvidenceCursor | null;
  loading: "first" | "older" | null;
  error: "first" | "older" | null;
  loaded: boolean;
  omitted: number;
};

/** A view-local read session. Refresh supersedes any older in-flight request. */
export function createBrowserEvidenceHistory(reader: BrowserEvidencePageReader) {
  let state: BrowserEvidenceHistoryState = {
    items: [],
    nextCursor: null,
    loading: null,
    error: null,
    loaded: false,
    omitted: 0,
  };
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<BrowserEvidenceHistoryState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  async function read(mode: "first" | "older") {
    if (mode === "older" && (state.loading || !state.nextCursor || state.error === "first")) return;
    const request = ++generation;
    const cursor = mode === "first" ? null : state.nextCursor;
    update({ loading: mode, error: null });
    try {
      const page = await reader.page(BROWSER_HISTORY_PAGE_SIZE, cursor);
      const projected = page.items.map(browserEvidenceToHistory);
      if (request !== generation) return;
      const combined = mode === "first" ? projected : [...state.items, ...projected];
      const dropped = Math.max(0, combined.length - BROWSER_HISTORY_WINDOW_SIZE);
      update({
        items: combined.slice(-BROWSER_HISTORY_WINDOW_SIZE),
        nextCursor: page.nextCursor,
        loaded: true,
        loading: null,
        omitted: mode === "first" ? 0 : state.omitted + dropped,
      });
    } catch {
      if (request === generation) update({ loading: null, error: mode });
    }
  }
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh: () => read("first"),
    loadOlder: () => read("older"),
    retry: () => read(state.error ?? "first"),
  };
}
