import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../../desktop/environment";
import {
  ingestBrowserObservation,
  type BrowserObservationIngressError,
  type BrowserObservationIngressResult,
} from "../../sources/browser";

export const BROWSER_OBSERVATION_RELAY_EVENT = "browser-observation-relay://request";
const BROWSER_OBSERVATION_RELAY_DRAIN_INTERVAL_MS = 250;

export type BrowserObservationRelayRequest = {
  requestId: string;
  observation: unknown;
};

export type BrowserObservationRelayAck =
  | {
      ok: true;
      kind: "context_snapshot" | "tab_activated" | "navigation_committed";
      route: "context" | "trace";
      contextRequired?: true;
    }
  | {
      ok: false;
      code: "unsupported_envelope" | "invalid_relay_request" | "persistence_failed";
      message: string;
      errors?: BrowserObservationIngressError[];
    };

export type BrowserObservationRelayAckInput = {
  requestId: string;
  acknowledgement: BrowserObservationRelayAck;
};

export type BrowserObservationConsumer = (
  result: Extract<BrowserObservationIngressResult, { status: "accepted" }>,
  deliveryId: string,
) => Promise<void | { contextRequired: boolean }>;

export async function acknowledgeBrowserObservationRelayRequest(
  request: unknown,
  consume: BrowserObservationConsumer,
): Promise<BrowserObservationRelayAckInput> {
  if (!isRelayRequest(request)) {
    return {
      requestId: "",
      acknowledgement: {
        ok: false,
        code: "invalid_relay_request",
        message: "Browser relay request must include requestId and observation.",
      },
    };
  }

  let result: BrowserObservationIngressResult;
  try {
    result = ingestBrowserObservation(request.observation);
  } catch {
    return {
      requestId: request.requestId,
      acknowledgement: {
        ok: false,
        code: "unsupported_envelope",
        message: "Browser observation was rejected.",
      },
    };
  }
  if (result.status === "rejected") {
    return {
      requestId: request.requestId,
      acknowledgement: {
        ok: false,
        code: "unsupported_envelope",
        message: "Browser observation envelope was rejected by Mori ingress.",
        errors: result.errors.map(({ field, code }) => ({
          field,
          code,
          message: "Invalid Browser observation field.",
        })),
      },
    };
  }

  let consumed: void | { contextRequired: boolean };
  try {
    consumed = await consume(result, request.requestId);
  } catch (error) {
    const code =
      error instanceof Error && error.message === "unsupported_envelope"
        ? "unsupported_envelope"
        : "persistence_failed";
    return {
      requestId: request.requestId,
      acknowledgement: {
        ok: false,
        code,
        message: "Mori could not accept the Browser observation into application storage.",
      },
    };
  }
  return {
    requestId: request.requestId,
    acknowledgement: {
      ok: true,
      kind: result.kind,
      route: result.route,
      ...(consumed?.contextRequired ? { contextRequired: true as const } : {}),
    },
  };
}

export async function installBrowserObservationRelay(
  consume: BrowserObservationConsumer,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;

  const { listen } = await import("@tauri-apps/api/event");
  let disposed = false;
  let draining = false;
  const drain = async () => {
    if (disposed || draining) return;
    draining = true;
    try {
      const requests = await invoke<unknown[]>("claim_browser_observation_relay_requests");
      for (const request of requests) {
        await acknowledgeBrowserObservationRelayRequestPayload(request, consume);
      }
    } catch {
      console.error("Browser observation relay drain failed.");
    } finally {
      draining = false;
    }
  };

  const unlisten = await listen<BrowserObservationRelayRequest>(
    BROWSER_OBSERVATION_RELAY_EVENT,
    () => {
      void drain();
    },
  );
  const interval = window.setInterval(() => {
    void drain();
  }, BROWSER_OBSERVATION_RELAY_DRAIN_INTERVAL_MS);
  void drain();
  return () => {
    disposed = true;
    window.clearInterval(interval);
    unlisten();
  };
}

async function acknowledgeBrowserObservationRelayRequestPayload(
  request: unknown,
  consume: BrowserObservationConsumer,
): Promise<void> {
  const input = await acknowledgeBrowserObservationRelayRequest(request, consume);
  if (!input.requestId) return;
  try {
    await invoke("ack_browser_observation_relay", { input });
  } catch {
    console.error("Browser observation relay acknowledgement failed.");
  }
}

function isRelayRequest(value: unknown): value is BrowserObservationRelayRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as BrowserObservationRelayRequest).requestId === "string" &&
    (value as BrowserObservationRelayRequest).requestId.trim().length > 0 &&
    "observation" in value
  );
}
