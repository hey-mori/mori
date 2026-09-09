export const MORI_BROWSER_NATIVE_HOST_NAME = "com.swarea.mori.browser";
export const MORI_BROWSER_NATIVE_HOST_DESCRIPTION = "Mori Browser observation receiver";

export type BrowserNativeHostManifest = {
  name: string;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
};

export type BrowserNativeHostManifestInput = {
  hostPath: string;
  extensionIds?: readonly string[];
  allowedOrigins?: readonly string[];
};

export function buildBrowserNativeHostManifest(
  input: BrowserNativeHostManifestInput,
): BrowserNativeHostManifest {
  const hostPath = input.hostPath.trim();
  if (!hostPath) {
    throw new Error("Native Messaging host path is required.");
  }

  const origins = [
    ...(input.extensionIds ?? []).map(extensionIdToNativeMessagingOrigin),
    ...(input.allowedOrigins ?? []).map(normalizeNativeMessagingOrigin),
  ];
  const uniqueOrigins = Array.from(new Set(origins));
  if (uniqueOrigins.length === 0) {
    throw new Error("At least one extension id or allowed origin is required.");
  }

  return {
    name: MORI_BROWSER_NATIVE_HOST_NAME,
    description: MORI_BROWSER_NATIVE_HOST_DESCRIPTION,
    path: hostPath,
    type: "stdio",
    allowed_origins: uniqueOrigins,
  };
}

export function extensionIdToNativeMessagingOrigin(extensionId: string): string {
  const normalized = extensionId.trim().toLowerCase();
  if (!/^[a-p]{32}$/.test(normalized)) {
    throw new Error("Native Messaging extension id must be a 32-character Chromium id.");
  }
  return `chrome-extension://${normalized}/`;
}

export function normalizeNativeMessagingOrigin(origin: string): string {
  const normalized = origin.trim().toLowerCase();
  if (!/^chrome-extension:\/\/[a-p]{32}\/$/.test(normalized)) {
    throw new Error("Native Messaging allowed origin must be chrome-extension://<id>/.");
  }
  return normalized;
}

export function isValidNativeMessagingHostName(name: string): boolean {
  return /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(name);
}
