import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../../desktop/environment";
import {
  ingestBrowserObservation,
  type BrowserObservationIngressError,
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
    }
  | {
      ok: false;
      code: "unsupported_envelope" | "invalid_relay_request";
      message: string;
      errors?: BrowserObservationIngressError[];
    };

export type BrowserObservationRelayAckInput = {
  requestId: string;
  acknowledgement: BrowserObservationRelayAck;
};

export function acknowledgeBrowserObservationRelayRequest(
  request: unknown,
): BrowserObservationRelayAckInput {
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

  const result = ingestBrowserObservation(request.observation);
  if (result.status === "rejected") {
    return {
      requestId: request.requestId,
      acknowledgement: {
        ok: false,
        code: "unsupported_envelope",
        message: "Browser observation envelope was rejected by Mori ingress.",
        errors: result.errors,
      },
    };
  }

  return {
    requestId: request.requestId,
    acknowledgement: {
      ok: true,
      kind: result.kind,
      route: result.route,
    },
  };
}

export async function installBrowserObservationRelay(): Promise<() => void> {
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
        await acknowledgeBrowserObservationRelayRequestPayload(request);
      }
    } catch (error) {
      console.error("Browser observation relay drain failed.", error);
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

async function acknowledgeBrowserObservationRelayRequestPayload(request: unknown): Promise<void> {
  const input = acknowledgeBrowserObservationRelayRequest(request);
  if (!input.requestId) return;
  try {
    await invoke("ack_browser_observation_relay", { input });
  } catch (error) {
    console.error("Browser observation relay acknowledgement failed.", error);
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
