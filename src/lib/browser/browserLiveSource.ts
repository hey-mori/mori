import {
  ingestBrowserObservation,
  type BrowserContextSnapshot,
  type BrowserObservationIngressResult,
  type BrowserObservationEnvelopeV1,
} from "../trace/sources/browser";
import {
  browserEvidenceToTrace,
  type BrowserEvidenceInput,
  type BrowserEvidenceRepository,
} from "./browserEvidenceRepository";

export const BROWSER_CONTEXT_FRESH_MS = 60_000;
type AcceptedObservation = Extract<BrowserObservationIngressResult, { status: "accepted" }>;
export type BrowserLiveState = {
  context: BrowserContextSnapshot | null;
  contextReceivedAt: string | null;
  lastReceivedAt: string | null;
  lastKind: BrowserObservationEnvelopeV1["kind"] | null;
  lastError: "persistence_failed" | "unsupported_envelope" | null;
};

/** One current snapshot, not history. Switching runtimes replaces the displayed snapshot. */
export function createBrowserLiveSource(
  repository: BrowserEvidenceRepository,
  now = () => new Date(),
) {
  let state: BrowserLiveState = {
    context: null,
    contextReceivedAt: null,
    lastReceivedAt: null,
    lastKind: null,
    lastError: null,
  };
  const listeners = new Set<() => void>();
  function update(patch: Partial<BrowserLiveState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  async function accept(result: AcceptedObservation, deliveryId: string) {
    const receivedAt = now().toISOString();
    let clean: AcceptedObservation;
    try {
      const projected = ingestBrowserObservation(projectPrivateObservation(result.envelope));
      if (projected.status !== "accepted") throw new Error("invalid observation");
      clean = projected;
    } catch {
      update({ lastError: "unsupported_envelope" });
      throw new BrowserApplicationError("unsupported_envelope");
    }
    if (clean.route === "context") {
      // An older snapshot from the same runtime cannot move current state backwards.
      if (
        !state.context ||
        state.context.runtime.id !== clean.context.runtime.id ||
        clean.context.observedAt >= state.context.observedAt
      ) {
        update({ context: clean.context, contextReceivedAt: receivedAt });
      }
    } else {
      const event = clean.traceEvent;
      const metadata = event.metadata;
      const details =
        clean.envelope.kind === "tab_activated" ? null : clean.envelope.payload.details;
      const input: BrowserEvidenceInput = {
        deliveryId,
        receivedAt,
        observedAt: event.occurredAt,
        kind: clean.kind,
        data: {
          provider: metadata.runtime.provider,
          runtimeId: clean.envelope.payload.runtime.installationId ?? null,
          tabId: metadata.tab.runtimeTabId,
          windowId:
            metadata.window?.runtimeWindowId ??
            clean.envelope.payload.tab?.windowId?.toString() ??
            null,
          url: metadata.resource?.url ?? null,
          active: clean.envelope.payload.tab?.active ?? null,
          focused: clean.envelope.payload.window?.focused ?? null,
          transitionType: details?.transitionType ?? null,
          transitionQualifiers: details?.transitionQualifiers ?? null,
        },
      };
      try {
        await repository.append(input);
      } catch {
        update({ lastError: "persistence_failed" });
        throw new BrowserApplicationError("persistence_failed");
      }
    }
    update({ lastReceivedAt: receivedAt, lastKind: clean.kind, lastError: null });
    return {
      contextRequired:
        clean.route === "trace" && contextFreshness(state, now().getTime()) !== "recent",
    };
  }
  return {
    accept,
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    latestContext: () => ({
      context: state.context,
      freshness: contextFreshness(state, now().getTime()),
    }),
    recentEvidence: async (limit = 50) =>
      (await repository.recent(Math.min(200, Math.max(1, limit)))).map(browserEvidenceToTrace),
  };
}

export class BrowserApplicationError extends Error {
  constructor(public readonly code: "unsupported_envelope" | "persistence_failed") {
    super(code);
  }
}

export function contextFreshness(
  state: BrowserLiveState,
  now: number,
): "unknown" | "recent" | "stale" {
  if (!state.context || !state.contextReceivedAt) return "unknown";
  return now - Date.parse(state.contextReceivedAt) < BROWSER_CONTEXT_FRESH_MS ? "recent" : "stale";
}

/** Only fields supported by today's privacy policy reach current state or storage. */
function projectPrivateObservation(
  envelope: BrowserObservationEnvelopeV1,
): BrowserObservationEnvelopeV1 {
  const id = (value: unknown): string | undefined => {
    if (value === undefined) return undefined;
    if ((typeof value !== "string" && typeof value !== "number") || String(value).length > 128)
      throw new Error("invalid id");
    return String(value);
  };
  const bool = (value: unknown): boolean | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new Error("invalid boolean");
    return value;
  };
  const url = (value: unknown): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.length > 16384) throw new Error("invalid URL");
    const parsed = new URL(value);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error("private URL");
    return parsed.href;
  };
  const tab = (
    value: NonNullable<
      Extract<BrowserObservationEnvelopeV1, { kind: "tab_activated" }>["payload"]["tab"]
    >,
  ) => ({
    id: id(value.id),
    windowId: id(value.windowId),
    active: bool(value.active),
    url: url(value.url),
  });
  const window = (
    value: NonNullable<
      Extract<BrowserObservationEnvelopeV1, { kind: "tab_activated" }>["payload"]["window"]
    >,
  ) => {
    if (value.incognito === true) throw new Error("private window");
    return { id: id(value.id), focused: bool(value.focused) };
  };
  const provider = envelope.payload.runtime.provider;
  if (typeof provider !== "string" || provider.length > 64) throw new Error("invalid provider");
  const runtime = { provider, installationId: id(envelope.payload.runtime.installationId) };
  const base = {
    version: 1 as const,
    source: "browser" as const,
    observedAt: new Date(envelope.observedAt).toISOString(),
  };
  if (envelope.kind === "context_snapshot") {
    return {
      ...base,
      kind: envelope.kind,
      payload: {
        runtime,
        urlDetailPolicy: "origin-path",
        windows: envelope.payload.windows.map((value) => ({
          ...window(value),
          tabs: (value.tabs ?? []).map(tab),
        })),
      },
    };
  }
  const common = {
    runtime,
    urlDetailPolicy: "origin-path" as const,
    tab: envelope.payload.tab ? tab(envelope.payload.tab) : undefined,
    window: envelope.payload.window ? window(envelope.payload.window) : undefined,
  };
  if (envelope.kind === "tab_activated") {
    return {
      ...base,
      kind: envelope.kind,
      payload: {
        ...common,
        activeInfo: {
          tabId: id(envelope.payload.activeInfo.tabId)!,
          windowId: id(envelope.payload.activeInfo.windowId)!,
        },
      },
    };
  }
  const details = envelope.payload.details;
  if (
    details.transitionType !== undefined &&
    (typeof details.transitionType !== "string" || details.transitionType.length > 64)
  )
    throw new Error("invalid transition");
  if (
    details.transitionQualifiers &&
    (details.transitionQualifiers.length > 16 ||
      details.transitionQualifiers.some((value) => value.length > 64))
  )
    throw new Error("invalid transition");
  return {
    ...base,
    kind: envelope.kind,
    payload: {
      ...common,
      details: {
        tabId: id(details.tabId)!,
        url: url(details.url)!,
        transitionType: details.transitionType,
        transitionQualifiers: details.transitionQualifiers,
      },
    },
  };
}
