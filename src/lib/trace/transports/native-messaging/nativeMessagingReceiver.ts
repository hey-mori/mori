import {
  ingestBrowserObservation,
  type BrowserObservationIngressError,
} from "../../sources/browser";
import {
  decodeNativeMessagingFrames,
  encodeNativeMessagingFrames,
  type NativeMessagingProtocolError,
} from "./nativeMessagingProtocol";

export type BrowserNativeMessagingAck =
  | {
      ok: true;
      kind:
        | "context_snapshot"
        | "tab_activated"
        | "navigation_committed"
        | "history_state_updated";
      route: "context" | "trace";
    }
  | {
      ok: false;
      code: "transport_error" | "invalid_json" | "unsupported_envelope";
      error: NativeMessagingProtocolError | BrowserNativeMessagingReceiverError;
      ingressErrors?: BrowserObservationIngressError[];
    };

export type BrowserNativeMessagingReceiverError = {
  code: "invalid_json" | "unsupported_envelope";
  message: string;
};

export type BrowserNativeMessagingReceiverResult = {
  acknowledgements: BrowserNativeMessagingAck[];
  output: Uint8Array;
};

export function receiveBrowserNativeMessagingInput(
  input: Uint8Array,
  options: { maxMessageBytes?: number } = {},
): BrowserNativeMessagingReceiverResult {
  const decoded = decodeNativeMessagingFrames(input, options);
  if (decoded.status === "rejected") {
    const acknowledgement: BrowserNativeMessagingAck = {
      ok: false,
      code: "transport_error",
      error: decoded.error,
    };
    return {
      acknowledgements: [acknowledgement],
      output: encodeNativeMessagingFrames([acknowledgement]),
    };
  }

  const acknowledgements = decoded.messages.map((message) => acknowledgeDecodedMessage(message));
  return {
    acknowledgements,
    output: encodeNativeMessagingFrames(acknowledgements),
  };
}

function acknowledgeDecodedMessage(message: string): BrowserNativeMessagingAck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch (error) {
    return {
      ok: false,
      code: "invalid_json",
      error: {
        code: "invalid_json",
        message: `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
      },
    };
  }

  const result = ingestBrowserObservation(parsed);
  if (result.status === "rejected") {
    return {
      ok: false,
      code: "unsupported_envelope",
      error: {
        code: "unsupported_envelope",
        message: "Browser observation envelope was rejected by Mori ingress.",
      },
      ingressErrors: result.errors,
    };
  }

  return {
    ok: true,
    kind: result.kind,
    route: result.route,
  };
}
