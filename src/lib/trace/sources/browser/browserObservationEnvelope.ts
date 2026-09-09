import type { TraceEvent } from "../../core";
import {
  browserResourceFromUrl,
  browserTabId,
  browserWindowId,
  buildBrowserContextSnapshot,
  type BrowserContextSnapshot,
  type BrowserRuntimeObservation,
  type BrowserRuntimeProvider,
  type BrowserTabObservation,
  type BrowserUrlDetailPolicy,
  type BrowserWindowObservation,
} from "./browserContext";
import {
  browserNavigationCommittedToTraceEvent,
  browserTabActivatedToTraceEvent,
  type BrowserTraceMetadata,
} from "./browserTrace";

export type BrowserObservationEnvelopeV1 =
  | BrowserContextSnapshotEnvelopeV1
  | BrowserTabActivatedEnvelopeV1
  | BrowserNavigationCommittedEnvelopeV1;

export type BrowserObservationEnvelopeKind = BrowserObservationEnvelopeV1["kind"];

export type BrowserObservationRuntimePayload = {
  provider: BrowserRuntimeProvider;
  label?: string;
  installationId?: string;
  version?: string;
  observedAt?: string;
};

export type BrowserObservationTabPayload = {
  id?: number | string;
  windowId?: number | string;
  active?: boolean;
  title?: string;
  url?: string;
  pinned?: boolean;
  audible?: boolean;
  status?: string;
};

export type BrowserObservationWindowPayload = {
  id?: number | string;
  focused?: boolean;
  state?: string;
  incognito?: boolean;
  tabs?: BrowserObservationTabPayload[];
};

export type BrowserObservationNavigationCommittedPayload = {
  tabId: number | string;
  url: string;
  timeStamp?: number;
  transitionType?: string;
  transitionQualifiers?: string[];
};

export type BrowserContextSnapshotEnvelopeV1 = {
  version: 1;
  source: "browser";
  kind: "context_snapshot";
  observedAt: string;
  payload: {
    runtime: BrowserObservationRuntimePayload;
    windows: BrowserObservationWindowPayload[];
    urlDetailPolicy?: BrowserUrlDetailPolicy;
  };
};

export type BrowserTabActivatedEnvelopeV1 = {
  version: 1;
  source: "browser";
  kind: "tab_activated";
  observedAt: string;
  payload: {
    runtime: BrowserObservationRuntimePayload;
    activeInfo: {
      tabId: number | string;
      windowId: number | string;
    };
    tab?: BrowserObservationTabPayload;
    window?: BrowserObservationWindowPayload;
    urlDetailPolicy?: BrowserUrlDetailPolicy;
  };
};

export type BrowserNavigationCommittedEnvelopeV1 = {
  version: 1;
  source: "browser";
  kind: "navigation_committed";
  observedAt: string;
  payload: {
    runtime: BrowserObservationRuntimePayload;
    details: BrowserObservationNavigationCommittedPayload;
    tab?: BrowserObservationTabPayload;
    window?: BrowserObservationWindowPayload;
    urlDetailPolicy?: BrowserUrlDetailPolicy;
  };
};

export function browserObservationEnvelopeToContextSnapshot(
  envelope: BrowserContextSnapshotEnvelopeV1,
): BrowserContextSnapshot {
  return buildBrowserContextSnapshot({
    observedAt: envelope.observedAt,
    runtime: browserRuntimeObservation(envelope.payload.runtime, envelope.observedAt),
    windows: envelope.payload.windows.map((window, index) => ({
      runtimeWindowId: window.id ?? `unknown-${index}`,
      focused: window.focused === true,
      state: browserWindowState(window.state),
      incognito: window.incognito,
      tabIds: (window.tabs ?? []).flatMap((tab) => (tab.id !== undefined ? [tab.id] : [])),
    })),
    tabs: envelope.payload.windows.flatMap((window, windowIndex) =>
      (window.tabs ?? []).flatMap((tab, tabIndex) => {
        const runtimeTabId = tab.id ?? `unknown-${windowIndex}-${tabIndex}`;
        const runtimeWindowId = tab.windowId ?? window.id ?? `unknown-${windowIndex}`;
        return [
          {
            runtimeTabId,
            windowId: runtimeWindowId,
            active: tab.active === true,
            title: tab.title,
            url: tab.url,
            pinned: tab.pinned,
            audible: tab.audible,
            status: browserTabStatus(tab.status),
          },
        ];
      }),
    ),
    urlDetailPolicy: envelope.payload.urlDetailPolicy,
  });
}

export function browserObservationEnvelopeToTraceEvent(
  envelope: BrowserTabActivatedEnvelopeV1 | BrowserNavigationCommittedEnvelopeV1,
): TraceEvent<BrowserTraceMetadata> {
  if (envelope.kind === "tab_activated") {
    const activeInfo = envelope.payload.activeInfo;
    const tab = browserTabObservation(
      envelope.payload.tab,
      activeInfo.tabId,
      activeInfo.windowId,
      true,
      envelope.payload.urlDetailPolicy,
    );
    const resource = envelope.payload.tab?.url
      ? browserResourceFromUrl({
          url: envelope.payload.tab.url,
          title: envelope.payload.tab.title,
          policy: envelope.payload.urlDetailPolicy,
        })
      : undefined;

    return browserTabActivatedToTraceEvent({
      occurredAt: envelope.observedAt,
      runtime: browserRuntimeObservation(envelope.payload.runtime, envelope.observedAt),
      window: browserWindowObservation(envelope.payload.window, activeInfo.windowId),
      tab: {
        ...tab,
        currentResourceId: resource?.id,
      },
      resource,
    });
  }

  const details = envelope.payload.details;
  const windowId = envelope.payload.tab?.windowId ?? envelope.payload.window?.id ?? -1;
  return browserNavigationCommittedToTraceEvent({
    occurredAt: envelope.observedAt,
    runtime: browserRuntimeObservation(envelope.payload.runtime, envelope.observedAt),
    window: envelope.payload.window
      ? browserWindowObservation(envelope.payload.window, windowId)
      : undefined,
    tab: browserTabObservation(
      envelope.payload.tab,
      details.tabId,
      windowId,
      envelope.payload.tab?.active === true,
      envelope.payload.urlDetailPolicy,
    ),
    url: details.url,
    title: envelope.payload.tab?.title,
    urlDetailPolicy: envelope.payload.urlDetailPolicy,
  });
}

function browserRuntimeObservation(
  runtime: BrowserObservationRuntimePayload,
  observedAt: string,
): BrowserRuntimeObservation {
  return {
    id: runtime.installationId ?? runtime.provider,
    provider: runtime.provider,
    label: runtime.label ?? runtime.provider,
    version: runtime.version,
    observedAt: runtime.observedAt ?? observedAt,
  };
}

function browserWindowObservation(
  window: BrowserObservationWindowPayload | undefined,
  runtimeWindowId: string | number,
): Omit<BrowserWindowObservation, "tabIds"> {
  return {
    id: browserWindowId(runtimeWindowId),
    runtimeWindowId: String(runtimeWindowId),
    focused: window?.focused === true,
    state: browserWindowState(window?.state),
    incognito: window?.incognito,
  };
}

function browserTabObservation(
  tab: BrowserObservationTabPayload | undefined,
  runtimeTabId: string | number,
  runtimeWindowId: string | number,
  active: boolean,
  urlDetailPolicy?: BrowserUrlDetailPolicy,
): BrowserTabObservation {
  const resource = tab?.url
    ? browserResourceFromUrl({
        url: tab.url,
        title: tab.title,
        policy: urlDetailPolicy,
      })
    : null;
  return {
    id: browserTabId(runtimeTabId),
    runtimeTabId: String(runtimeTabId),
    windowId: browserWindowId(runtimeWindowId),
    active,
    currentResourceId: resource?.id,
    title: tab?.title || undefined,
    pinned: tab?.pinned,
    audible: tab?.audible,
    status: browserTabStatus(tab?.status),
  };
}

function browserWindowState(value: string | undefined): BrowserWindowObservation["state"] {
  switch (value) {
    case "normal":
    case "minimized":
    case "maximized":
    case "fullscreen":
      return value;
    default:
      return value ? "unknown" : undefined;
  }
}

function browserTabStatus(value: string | undefined): BrowserTabObservation["status"] {
  switch (value) {
    case "loading":
    case "complete":
      return value;
    default:
      return value ? "unknown" : undefined;
  }
}
