export {
  DEFAULT_MAX_NATIVE_MESSAGE_BYTES,
  NATIVE_MESSAGING_HEADER_BYTES,
  decodeNativeMessagingFrames,
  encodeNativeMessagingFrame,
  encodeNativeMessagingFrames,
  encodeNativeMessagingTextFrame,
  type DecodeNativeMessagingFramesResult,
  type NativeMessagingProtocolError,
  type NativeMessagingProtocolErrorCode,
} from "./nativeMessagingProtocol";
export {
  receiveBrowserNativeMessagingInput,
  type BrowserNativeMessagingAck,
  type BrowserNativeMessagingReceiverError,
  type BrowserNativeMessagingReceiverResult,
} from "./nativeMessagingReceiver";
export {
  MORI_BROWSER_NATIVE_HOST_DESCRIPTION,
  MORI_BROWSER_NATIVE_HOST_NAME,
  buildBrowserNativeHostManifest,
  extensionIdToNativeMessagingOrigin,
  isValidNativeMessagingHostName,
  normalizeNativeMessagingOrigin,
  type BrowserNativeHostManifest,
  type BrowserNativeHostManifestInput,
} from "./nativeMessagingHostManifest";
