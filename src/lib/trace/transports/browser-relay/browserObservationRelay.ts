import { invoke } from "@tauri-apps/api/core";
import type { Event } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../../../desktop/environment";
import {
  ingestBrowserObservation,
  type BrowserObservationIngressError,
} from "../../sources/browser";

export const BROWSER_OBSERVATION_RELAY_EVENT = "browser-observation-relay://request";

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
  const unlisten = await listen<BrowserObservationRelayRequest>(
    BROWSER_OBSERVATION_RELAY_EVENT,
    (event) => {
      void acknowledgeBrowserObservationRelayEvent(event);
    },
  );
  return unlisten;
}

async function acknowledgeBrowserObservationRelayEvent(
  event: Event<BrowserObservationRelayRequest>,
): Promise<void> {
  const input = acknowledgeBrowserObservationRelayRequest(event.payload);
  if (!input.requestId) return;
  await invoke("ack_browser_observation_relay", { input });
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
