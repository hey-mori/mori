export const MORI_BROWSER_NATIVE_HOST_NAME = "com.swarea.mori.browser";
export const MORI_BROWSER_NATIVE_HOST_DESCRIPTION = "Mori Browser observation receiver";

export function resolveAllowedOriginsFromEnv(env = process.env) {
  const rawOrigins = splitEnv(env.MORI_BROWSER_ALLOWED_ORIGINS || "");
  const extensionIds = [
    ...splitEnv(env.MORI_BROWSER_CHROME_EXTENSION_ID || ""),
    ...splitEnv(env.MORI_BROWSER_EXTENSION_ID || ""),
  ];
  const origins = [
    ...rawOrigins.map(normalizeOrigin),
    ...extensionIds.map(extensionIdToOrigin),
  ];
  const unique = [...new Set(origins)];
  if (unique.length === 0) {
    throw new Error(
      "Set MORI_BROWSER_CHROME_EXTENSION_ID or MORI_BROWSER_ALLOWED_ORIGINS before running npm run tauri:build.",
    );
  }
  return unique;
}

export function extensionIdToOrigin(extensionId) {
  const normalized = extensionId.trim().toLowerCase();
  if (!/^[a-p]{32}$/.test(normalized)) {
    throw new Error(`${extensionId} is not a 32-character Chromium extension id.`);
  }
  return `chrome-extension://${normalized}/`;
}

export function normalizeOrigin(origin) {
  const normalized = origin.trim().toLowerCase();
  if (!/^chrome-extension:\/\/[a-p]{32}\/$/.test(normalized)) {
    throw new Error(`${origin} is not a Native Messaging extension origin.`);
  }
  return normalized;
}

export function renderTauriConfig(installerHooksPath) {
  return {
    bundle: {
      windows: {
        nsis: {
          installMode: "currentUser",
          installerHooks: installerHooksPath,
        },
      },
    },
  };
}

export function renderNsisHooks(allowedOrigins) {
  const originsJson = `[${allowedOrigins.map((origin) => `"${origin}"`).join(",")}]`;
  return `!define MORI_BROWSER_NATIVE_HOST_NAME "${MORI_BROWSER_NATIVE_HOST_NAME}"
!define MORI_BROWSER_NATIVE_HOST_DESCRIPTION "${MORI_BROWSER_NATIVE_HOST_DESCRIPTION}"
!define MORI_BROWSER_ALLOWED_ORIGINS '${originsJson}'

Function MoriBrowserJsonEscape
  Exch $0
  Push $1
  Push $2
  Push $3
  StrCpy $1 ""
  moriBrowserJsonLoop:
    StrCpy $2 $0 1
    StrCmp $2 "" moriBrowserJsonDone
    StrCpy $0 $0 "" 1
    StrCmp $2 "\\" moriBrowserJsonBackslash
    StrCmp $2 '"' moriBrowserJsonQuote
    StrCpy $1 "$1$2"
    Goto moriBrowserJsonLoop
  moriBrowserJsonBackslash:
    StrCpy $1 "$1\\\\"
    Goto moriBrowserJsonLoop
  moriBrowserJsonQuote:
    StrCpy $1 '$1\\"'
    Goto moriBrowserJsonLoop
  moriBrowserJsonDone:
    Pop $3
    Pop $2
    Exch $1
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current
  CreateDirectory "$LOCALAPPDATA\\Mori\\NativeMessagingHosts"
  StrCpy $0 "$INSTDIR\\mori-browser-native-host.exe"
  Push $0
  Call MoriBrowserJsonEscape
  Pop $1
  FileOpen $2 "$LOCALAPPDATA\\Mori\\NativeMessagingHosts\\${"${MORI_BROWSER_NATIVE_HOST_NAME}"}.json" w
  FileWrite $2 "{$\\r$\\n"
  FileWrite $2 '  "name": "${"${MORI_BROWSER_NATIVE_HOST_NAME}"}",$\\r$\\n'
  FileWrite $2 '  "description": "${"${MORI_BROWSER_NATIVE_HOST_DESCRIPTION}"}",$\\r$\\n'
  FileWrite $2 '  "path": "$1",$\\r$\\n'
  FileWrite $2 '  "type": "stdio",$\\r$\\n'
  FileWrite $2 '  "allowed_origins": ${"${MORI_BROWSER_ALLOWED_ORIGINS}"}$\\r$\\n'
  FileWrite $2 "}$\\r$\\n"
  FileClose $2
  WriteRegStr HKCU "Software\\Google\\Chrome\\NativeMessagingHosts\\${"${MORI_BROWSER_NATIVE_HOST_NAME}"}" "" "$LOCALAPPDATA\\Mori\\NativeMessagingHosts\\${"${MORI_BROWSER_NATIVE_HOST_NAME}"}.json"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  SetShellVarContext current
  ReadRegStr $0 HKCU "Software\\Google\\Chrome\\NativeMessagingHosts\\${"${MORI_BROWSER_NATIVE_HOST_NAME}"}" ""
  StrCmp $0 "$LOCALAPPDATA\\Mori\\NativeMessagingHosts\\${"${MORI_BROWSER_NATIVE_HOST_NAME}"}.json" 0 moriBrowserNativeHostUninstallDone
  DeleteRegKey HKCU "Software\\Google\\Chrome\\NativeMessagingHosts\\${"${MORI_BROWSER_NATIVE_HOST_NAME}"}"
  Delete "$LOCALAPPDATA\\Mori\\NativeMessagingHosts\\${"${MORI_BROWSER_NATIVE_HOST_NAME}"}.json"
  moriBrowserNativeHostUninstallDone:
!macroend
`;
}

function splitEnv(value) {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
