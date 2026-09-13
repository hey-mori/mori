import { invoke } from "@tauri-apps/api/core";
import { browserObservationEnvelopeToTraceEvent } from "../trace/sources/browser";

/** Storage identity is a relay delivery, never a semantic observation identity. */
export type BrowserEvidenceInput = {
  deliveryId: string;
  observedAt: string;
  receivedAt: string;
  kind: "tab_activated" | "navigation_committed";
  data: {
    provider: string;
    runtimeId: string | null;
    tabId: string;
    windowId: string | null;
    url: string | null;
    active: boolean | null;
    focused: boolean | null;
    transitionType: string | null;
    transitionQualifiers: string[] | null;
  };
};

export type BrowserEvidenceRow = BrowserEvidenceInput & { sequence: number };

export interface BrowserEvidenceRepository {
  append(input: BrowserEvidenceInput): Promise<number>;
  recent(limit: number): Promise<BrowserEvidenceRow[]>;
}

// No localStorage fallback: a successful desktop ACK must mean a durable write.
export const browserEvidenceRepository: BrowserEvidenceRepository = {
  append: (input) => invoke<number>("append_browser_evidence", { input }),
  recent: (limit) => invoke<BrowserEvidenceRow[]>("list_recent_browser_evidence", { limit }),
};

export function browserEvidenceToTrace(row: BrowserEvidenceRow) {
  const { data } = row;
  const common = {
    runtime: { provider: data.provider, installationId: data.runtimeId ?? undefined },
    urlDetailPolicy: "origin-path" as const,
    tab: {
      id: data.tabId,
      windowId: data.windowId ?? undefined,
      url: data.url ?? undefined,
      active: data.active ?? undefined,
    },
    window:
      data.windowId === null
        ? undefined
        : {
            id: data.windowId,
            focused: data.focused ?? undefined,
          },
  };
  const base = { version: 1 as const, source: "browser" as const, observedAt: row.observedAt };
  const traceEvent =
    row.kind === "tab_activated"
      ? browserObservationEnvelopeToTraceEvent({
          ...base,
          kind: row.kind,
          payload: {
            ...common,
            activeInfo: { tabId: data.tabId, windowId: data.windowId ?? "unknown" },
          },
        })
      : browserObservationEnvelopeToTraceEvent({
          ...base,
          kind: row.kind,
          payload: {
            ...common,
            details: { tabId: data.tabId, url: data.url! },
          },
        });
  return { ...row, traceEvent };
}
