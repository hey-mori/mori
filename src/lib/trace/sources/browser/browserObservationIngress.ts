import type { TraceEvent } from "../../core";
import type { BrowserContextSnapshot, BrowserUrlDetailPolicy } from "./browserContext";
import {
  browserObservationEnvelopeToContextSnapshot,
  browserObservationEnvelopeToTraceEvent,
  type BrowserContextSnapshotEnvelopeV1,
  type BrowserHistoryStateUpdatedEnvelopeV1,
  type BrowserNavigationCommittedEnvelopeV1,
  type BrowserObservationEnvelopeKind,
  type BrowserObservationEnvelopeV1,
  type BrowserTabActivatedEnvelopeV1,
} from "./browserObservationEnvelope";
import type { BrowserTraceMetadata } from "./browserTrace";

export type BrowserObservationIngressResult =
  | {
      status: "accepted";
      route: "context";
      kind: "context_snapshot";
      envelope: BrowserContextSnapshotEnvelopeV1;
      context: BrowserContextSnapshot;
    }
  | {
      status: "accepted";
      route: "trace";
      kind: "tab_activated" | "navigation_committed" | "history_state_updated";
      envelope:
        | BrowserTabActivatedEnvelopeV1
        | BrowserNavigationCommittedEnvelopeV1
        | BrowserHistoryStateUpdatedEnvelopeV1;
      traceEvent: TraceEvent<BrowserTraceMetadata>;
    }
  | {
      status: "rejected";
      errors: BrowserObservationIngressError[];
    };

export type BrowserObservationIngressError = {
  field: string | null;
  code:
    | "invalid_json"
    | "invalid_object"
    | "unsupported_version"
    | "wrong_source"
    | "unknown_kind"
    | "missing_field"
    | "invalid_timestamp"
    | "invalid_payload"
    | "invalid_url"
    | "unsanitized_url";
  message: string;
};

const BROWSER_OBSERVATION_KINDS = [
  "context_snapshot",
  "tab_activated",
  "navigation_committed",
  "history_state_updated",
] as const satisfies readonly BrowserObservationEnvelopeKind[];

const URL_POLICIES = new Set<BrowserUrlDetailPolicy>([
  "origin",
  "origin-path",
  "full-without-credentials",
]);

export function ingestBrowserObservation(value: unknown): BrowserObservationIngressResult {
  const validation = validateBrowserObservationEnvelope(value);
  if (validation.status === "rejected") return validation;

  const envelope = validation.envelope;
  if (envelope.kind === "context_snapshot") {
    return {
      status: "accepted",
      route: "context",
      kind: envelope.kind,
      envelope,
      context: browserObservationEnvelopeToContextSnapshot(envelope),
    };
  }

  return {
    status: "accepted",
    route: "trace",
    kind: envelope.kind,
    envelope,
    traceEvent: browserObservationEnvelopeToTraceEvent(envelope),
  };
}

export function ingestBrowserObservationJson(text: string): BrowserObservationIngressResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      status: "rejected",
      errors: [
        {
          field: null,
          code: "invalid_json",
          message: `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
        },
      ],
    };
  }
  return ingestBrowserObservation(parsed);
}

export function validateBrowserObservationEnvelope(
  value: unknown,
):
  | { status: "accepted"; envelope: BrowserObservationEnvelopeV1 }
  | { status: "rejected"; errors: BrowserObservationIngressError[] } {
  const errors: BrowserObservationIngressError[] = [];

  if (!isObject(value)) {
    return {
      status: "rejected",
      errors: [
        {
          field: null,
          code: "invalid_object",
          message: "Browser observation must be a JSON object.",
        },
      ],
    };
  }

  if (value.version !== 1) {
    errors.push({
      field: "version",
      code: "unsupported_version",
      message: "Browser observation version must be 1.",
    });
  }

  if (value.source !== "browser") {
    errors.push({
      field: "source",
      code: "wrong_source",
      message: 'Browser observation source must be "browser".',
    });
  }

  const kind = readString(value, "kind");
  if (!kind) {
    errors.push({ field: "kind", code: "missing_field", message: "kind is required." });
  } else if (!isBrowserObservationKind(kind)) {
    errors.push({
      field: "kind",
      code: "unknown_kind",
      message: `Unsupported Browser observation kind: ${kind}.`,
    });
  }

  const observedAt = readString(value, "observedAt");
  if (!observedAt) {
    errors.push({
      field: "observedAt",
      code: "missing_field",
      message: "observedAt is required.",
    });
  } else if (!isValidTimestamp(observedAt)) {
    errors.push({
      field: "observedAt",
      code: "invalid_timestamp",
      message: "observedAt must be a valid timestamp.",
    });
  }

  const payload = readObject(value, "payload");
  if (!payload) {
    errors.push({
      field: "payload",
      code: "missing_field",
      message: "payload is required.",
    });
  }

  if (payload && kind && isBrowserObservationKind(kind)) {
    validateCommonPayload(payload, errors);
    switch (kind) {
      case "context_snapshot":
        validateContextSnapshotPayload(payload, errors);
        break;
      case "tab_activated":
        validateTabActivatedPayload(payload, errors);
        break;
      case "navigation_committed":
      case "history_state_updated":
        validateNavigationCommittedPayload(payload, errors);
        break;
    }
  }

  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  return { status: "accepted", envelope: value as BrowserObservationEnvelopeV1 };
}

function validateCommonPayload(
  payload: Record<string, unknown>,
  errors: BrowserObservationIngressError[],
): void {
  const runtime = readObject(payload, "runtime");
  if (!runtime) {
    errors.push({
      field: "payload.runtime",
      code: "missing_field",
      message: "payload.runtime is required.",
    });
  } else if (!readString(runtime, "provider")) {
    errors.push({
      field: "payload.runtime.provider",
      code: "missing_field",
      message: "payload.runtime.provider is required.",
    });
  }

  const policy = payload.urlDetailPolicy;
  if (
    policy !== undefined &&
    (typeof policy !== "string" || !URL_POLICIES.has(policy as BrowserUrlDetailPolicy))
  ) {
    errors.push({
      field: "payload.urlDetailPolicy",
      code: "invalid_payload",
      message: "payload.urlDetailPolicy is not supported.",
    });
  }
}

function validateContextSnapshotPayload(
  payload: Record<string, unknown>,
  errors: BrowserObservationIngressError[],
): void {
  const windows = payload.windows;
  if (!Array.isArray(windows)) {
    errors.push({
      field: "payload.windows",
      code: "missing_field",
      message: "payload.windows must be an array.",
    });
    return;
  }

  windows.forEach((window, windowIndex) => {
    if (!isObject(window)) {
      errors.push({
        field: `payload.windows.${windowIndex}`,
        code: "invalid_payload",
        message: "window must be an object.",
      });
      return;
    }

    const tabs = window.tabs;
    if (tabs !== undefined && !Array.isArray(tabs)) {
      errors.push({
        field: `payload.windows.${windowIndex}.tabs`,
        code: "invalid_payload",
        message: "window.tabs must be an array when present.",
      });
      return;
    }

    if (Array.isArray(tabs)) {
      tabs.forEach((tab, tabIndex) => {
        if (!isObject(tab)) {
          errors.push({
            field: `payload.windows.${windowIndex}.tabs.${tabIndex}`,
            code: "invalid_payload",
            message: "tab must be an object.",
          });
          return;
        }
        validateOptionalBrowserUrl(
          tab.url,
          `payload.windows.${windowIndex}.tabs.${tabIndex}.url`,
          errors,
        );
      });
    }
  });
}

function validateTabActivatedPayload(
  payload: Record<string, unknown>,
  errors: BrowserObservationIngressError[],
): void {
  const activeInfo = readObject(payload, "activeInfo");
  if (!activeInfo) {
    errors.push({
      field: "payload.activeInfo",
      code: "missing_field",
      message: "payload.activeInfo is required.",
    });
  } else {
    if (!hasStringOrNumber(activeInfo, "tabId")) {
      errors.push({
        field: "payload.activeInfo.tabId",
        code: "missing_field",
        message: "payload.activeInfo.tabId is required.",
      });
    }
    if (!hasStringOrNumber(activeInfo, "windowId")) {
      errors.push({
        field: "payload.activeInfo.windowId",
        code: "missing_field",
        message: "payload.activeInfo.windowId is required.",
      });
    }
  }

  const tab = payload.tab;
  if (tab !== undefined) {
    if (!isObject(tab)) {
      errors.push({
        field: "payload.tab",
        code: "invalid_payload",
        message: "payload.tab must be an object when present.",
      });
    } else {
      validateOptionalBrowserUrl(tab.url, "payload.tab.url", errors);
    }
  }
}

function validateNavigationCommittedPayload(
  payload: Record<string, unknown>,
  errors: BrowserObservationIngressError[],
): void {
  const details = readObject(payload, "details");
  if (!details) {
    errors.push({
      field: "payload.details",
      code: "missing_field",
      message: "payload.details is required.",
    });
    return;
  }

  if (!hasStringOrNumber(details, "tabId")) {
    errors.push({
      field: "payload.details.tabId",
      code: "missing_field",
      message: "payload.details.tabId is required.",
    });
  }

  const url = readString(details, "url");
  if (!url) {
    errors.push({
      field: "payload.details.url",
      code: "missing_field",
      message: "payload.details.url is required.",
    });
  } else {
    validateBrowserUrl(url, "payload.details.url", errors);
  }

  const transitionQualifiers = details.transitionQualifiers;
  if (
    transitionQualifiers !== undefined &&
    (!Array.isArray(transitionQualifiers) ||
      transitionQualifiers.some((qualifier) => typeof qualifier !== "string"))
  ) {
    errors.push({
      field: "payload.details.transitionQualifiers",
      code: "invalid_payload",
      message: "payload.details.transitionQualifiers must be a string array.",
    });
  }

  const tab = payload.tab;
  if (tab !== undefined) {
    if (!isObject(tab)) {
      errors.push({
        field: "payload.tab",
        code: "invalid_payload",
        message: "payload.tab must be an object when present.",
      });
    } else {
      validateOptionalBrowserUrl(tab.url, "payload.tab.url", errors);
    }
  }
}

function validateOptionalBrowserUrl(
  value: unknown,
  field: string,
  errors: BrowserObservationIngressError[],
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({
      field,
      code: "invalid_url",
      message: `${field} must be a non-empty URL string when present.`,
    });
    return;
  }
  validateBrowserUrl(value, field, errors);
}

function validateBrowserUrl(
  value: string,
  field: string,
  errors: BrowserObservationIngressError[],
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    errors.push({
      field,
      code: "invalid_url",
      message: `${field} must be a valid URL.`,
    });
    return;
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    errors.push({
      field,
      code: "unsanitized_url",
      message: `${field} must not contain credentials, query, or fragment.`,
    });
  }
}

function isBrowserObservationKind(value: string): value is BrowserObservationEnvelopeKind {
  return BROWSER_OBSERVATION_KINDS.includes(value as BrowserObservationEnvelopeKind);
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function hasStringOrNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" || typeof value[key] === "number";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const raw = value[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readObject(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const raw = value[key];
  if (!isObject(raw)) return null;
  return raw;
}
