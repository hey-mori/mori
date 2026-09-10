import type { TraceEvent, TraceSourceDescriptor } from "../../core";
import {
  browserResourceFromUrl,
  browserResourceId,
  browserTabId,
  browserWindowId,
  stableSuffix,
  type BrowserProfileObservation,
  type BrowserResourceObservation,
  type BrowserRuntimeObservation,
  type BrowserTabObservation,
  type BrowserUrlDetailPolicy,
  type BrowserWindowObservation,
} from "./browserContext";

export type BrowserTraceKind = "tab_activated" | "navigation_committed";

export type BrowserTraceMetadata = {
  runtime: Pick<BrowserRuntimeObservation, "id" | "provider" | "label" | "version">;
  profile?: BrowserProfileObservation;
  window?: Omit<BrowserWindowObservation, "tabIds">;
  tab: BrowserTabObservation;
  resource?: BrowserResourceObservation;
  privacy: BrowserResourceObservation["privacy"];
};

export type BrowserTabActivatedObservation = {
  kind: "tab_activated";
  occurredAt: string;
  runtime: BrowserRuntimeObservation;
  profile?: BrowserProfileObservation;
  window?: Omit<BrowserWindowObservation, "tabIds">;
  tab: BrowserTabObservation;
  resource?: BrowserResourceObservation;
};

export type BrowserNavigationCommittedObservation = {
  kind: "navigation_committed";
  occurredAt: string;
  runtime: BrowserRuntimeObservation;
  profile?: BrowserProfileObservation;
  window?: Omit<BrowserWindowObservation, "tabIds">;
  tab: Omit<BrowserTabObservation, "currentResourceId"> & { currentResourceId?: string };
  url: string;
  title?: string;
  urlDetailPolicy?: BrowserUrlDetailPolicy;
};

export type BrowserTraceObservation =
  | BrowserTabActivatedObservation
  | BrowserNavigationCommittedObservation;

export function browserObservationToTraceEvent(
  observation: BrowserTraceObservation,
): TraceEvent<BrowserTraceMetadata> {
  const metadata = browserTraceMetadata(observation);
  return {
    id: browserTraceEventId(observation, metadata),
    source: browserTraceSource(observation.runtime, observation.profile),
    kind: `browser.${observation.kind}`,
    occurredAt: observation.occurredAt,
    title: browserTraceTitle(observation, metadata.resource),
    summary: browserTraceSummary(observation, metadata.resource),
    confidence: 0.9,
    metadata,
  };
}

export function browserTabActivatedToTraceEvent(
  observation: Omit<BrowserTabActivatedObservation, "kind">,
): TraceEvent<BrowserTraceMetadata> {
  return browserObservationToTraceEvent({ ...observation, kind: "tab_activated" });
}

export function browserNavigationCommittedToTraceEvent(
  observation: Omit<BrowserNavigationCommittedObservation, "kind">,
): TraceEvent<BrowserTraceMetadata> {
  return browserObservationToTraceEvent({ ...observation, kind: "navigation_committed" });
}

function browserTraceMetadata(observation: BrowserTraceObservation): BrowserTraceMetadata {
  const resource =
    observation.kind === "navigation_committed"
      ? browserResourceFromUrl({
          url: observation.url,
          title: observation.title ?? observation.tab.title,
          policy: observation.urlDetailPolicy,
        })
      : observation.resource;
  const currentResourceId =
    observation.kind === "navigation_committed"
      ? (resource?.id ?? browserResourceId(observation.url))
      : observation.tab.currentResourceId;
  const tab =
    observation.kind === "navigation_committed"
      ? {
          ...observation.tab,
          currentResourceId,
        }
      : observation.tab;
  return {
    runtime: {
      id: observation.runtime.id,
      provider: observation.runtime.provider,
      label: observation.runtime.label,
      version: observation.runtime.version,
    },
    profile: observation.profile,
    window: observation.window,
    tab,
    resource,
    privacy: resource?.privacy ?? {
      urlDetailPolicy: "origin-path",
      titleCaptured: Boolean(tab.title),
      contentCaptured: false,
      queryCaptured: false,
      fragmentCaptured: false,
      credentialsCaptured: false,
    },
  };
}

function browserTraceSource(
  runtime: BrowserRuntimeObservation,
  profile: BrowserProfileObservation | undefined,
): TraceSourceDescriptor {
  return {
    id: `browser:${runtime.provider}:${stableSuffix(runtime.id)}`,
    kind: "browser",
    label: runtime.label,
    provider: runtime.provider,
    scopeLabel: profile?.label ?? profile?.id,
  };
}

function browserTraceEventId(
  observation: BrowserTraceObservation,
  metadata: BrowserTraceMetadata,
): string {
  const resourceId = metadata.resource?.id ?? "no-resource";
  return `trace-browser-${observation.kind}-${stableSuffix(observation.runtime.id)}-${stableSuffix(metadata.tab.id)}-${stableSuffix(resourceId)}-${stableSuffix(observation.occurredAt)}`;
}

function browserTraceTitle(
  observation: BrowserTraceObservation,
  resource: BrowserResourceObservation | undefined,
): string {
  if (observation.kind === "tab_activated") {
    return `Tab activated${resource?.title ? `: ${resource.title}` : ""}`;
  }
  return `Navigation committed${resource?.title ? `: ${resource.title}` : ""}`;
}

function browserTraceSummary(
  observation: BrowserTraceObservation,
  resource: BrowserResourceObservation | undefined,
): string {
  const url =
    resource?.url ??
    (observation.kind === "navigation_committed" ? browserResourceId(observation.url) : "");
  if (observation.kind === "tab_activated") {
    return url ? `Active tab now points to ${url}` : "Active browser tab changed";
  }
  return `Browser tab navigated to ${resource?.url ?? "a resource"}`;
}
