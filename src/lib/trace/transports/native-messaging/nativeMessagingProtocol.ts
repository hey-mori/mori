export const NATIVE_MESSAGING_HEADER_BYTES = 4;
export const DEFAULT_MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;

export type NativeMessagingProtocolErrorCode =
  | "invalid_length"
  | "empty_message"
  | "oversized_message"
  | "truncated_payload"
  | "invalid_utf8";

export type NativeMessagingProtocolError = {
  code: NativeMessagingProtocolErrorCode;
  message: string;
};

export type DecodeNativeMessagingFramesResult =
  | {
      status: "accepted";
      messages: string[];
    }
  | {
      status: "rejected";
      error: NativeMessagingProtocolError;
    };

export function decodeNativeMessagingFrames(
  input: Uint8Array,
  options: { maxMessageBytes?: number } = {},
): DecodeNativeMessagingFramesResult {
  const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_NATIVE_MESSAGE_BYTES;
  const messages: string[] = [];
  let offset = 0;

  if (input.byteLength < NATIVE_MESSAGING_HEADER_BYTES) {
    return rejected("invalid_length", "Native Messaging input is missing a frame header.");
  }

  while (offset < input.byteLength) {
    if (input.byteLength - offset < NATIVE_MESSAGING_HEADER_BYTES) {
      return rejected("invalid_length", "Native Messaging input ended inside a frame header.");
    }

    const length = readNativeLength(input, offset);
    offset += NATIVE_MESSAGING_HEADER_BYTES;

    if (length === 0) {
      return rejected("empty_message", "Native Messaging frame length must be greater than zero.");
    }
    if (length > maxMessageBytes) {
      return rejected(
        "oversized_message",
        `Native Messaging frame is too large (${length} bytes > ${maxMessageBytes} byte cap).`,
      );
    }
    if (input.byteLength - offset < length) {
      return rejected("truncated_payload", "Native Messaging input ended inside a frame payload.");
    }

    const payload = input.subarray(offset, offset + length);
    offset += length;

    try {
      messages.push(new TextDecoder("utf-8", { fatal: true }).decode(payload));
    } catch {
      return rejected("invalid_utf8", "Native Messaging frame payload must be valid UTF-8.");
    }
  }

  return { status: "accepted", messages };
}

export function encodeNativeMessagingFrame(
  message: unknown,
  options: { maxMessageBytes?: number } = {},
): Uint8Array {
  return encodeNativeMessagingTextFrame(JSON.stringify(message), options);
}

export function encodeNativeMessagingTextFrame(
  text: string,
  options: { maxMessageBytes?: number } = {},
): Uint8Array {
  const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_NATIVE_MESSAGE_BYTES;
  const payload = new TextEncoder().encode(text);
  if (payload.byteLength > maxMessageBytes) {
    throw new Error(
      `Native Messaging response is too large (${payload.byteLength} bytes > ${maxMessageBytes} byte cap).`,
    );
  }

  const output = new Uint8Array(NATIVE_MESSAGING_HEADER_BYTES + payload.byteLength);
  writeNativeLength(output, 0, payload.byteLength);
  output.set(payload, NATIVE_MESSAGING_HEADER_BYTES);
  return output;
}

export function encodeNativeMessagingFrames(messages: readonly unknown[]): Uint8Array {
  const frames = messages.map((message) => encodeNativeMessagingFrame(message));
  const totalLength = frames.reduce((sum, frame) => sum + frame.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const frame of frames) {
    output.set(frame, offset);
    offset += frame.byteLength;
  }
  return output;
}

function readNativeLength(input: Uint8Array, offset: number): number {
  return new DataView(input.buffer, input.byteOffset + offset, NATIVE_MESSAGING_HEADER_BYTES).getUint32(
    0,
    isNativeLittleEndian(),
  );
}

function writeNativeLength(output: Uint8Array, offset: number, length: number): void {
  new DataView(output.buffer, output.byteOffset + offset, NATIVE_MESSAGING_HEADER_BYTES).setUint32(
    0,
    length,
    isNativeLittleEndian(),
  );
}

let cachedNativeLittleEndian: boolean | null = null;

function isNativeLittleEndian(): boolean {
  if (cachedNativeLittleEndian !== null) return cachedNativeLittleEndian;
  const buffer = new ArrayBuffer(4);
  new Uint32Array(buffer)[0] = 0x01020304;
  cachedNativeLittleEndian = new Uint8Array(buffer)[0] === 0x04;
  return cachedNativeLittleEndian;
}

function rejected(
  code: NativeMessagingProtocolErrorCode,
  message: string,
): DecodeNativeMessagingFramesResult {
  return { status: "rejected", error: { code, message } };
}
