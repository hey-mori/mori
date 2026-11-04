# Mori Browser Native Host

This folder records the current Native Messaging install model for the Mori
Browser receiver.

The production Browser extension still lives in `hey-mori/mori-browser-extension`.
This folder does not connect the extension transport client yet, add reconnect
behavior, offline queueing, or production persistence.

## Host

Host name:

```text
com.swarea.mori.browser
```

The host manifest follows the Chromium Native Messaging shape:

```json
{
  "name": "com.swarea.mori.browser",
  "description": "Mori Browser observation receiver",
  "path": "C:\\Program Files\\Mori\\mori-browser-native-host.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"]
}
```

`allowed_origins` is generated from explicit extension ids. The unpacked
extension carries a public key in its manifest that fixes its id at
`nmkjbmmnefgglmkddfokahclckjkldek` in Chrome and Edge, and the installer
registers that id by default (`scripts/prepare-browser-native-host-bundle.mjs`).
A Chrome Web Store or Edge Add-ons id, which the stores assign, is added through
`MORI_BROWSER_CHROME_EXTENSION_ID` or `MORI_BROWSER_EDGE_EXTENSION_ID` at build
time and registered beside it.

During local development, build the helper with Cargo and point the manifest at
the debug executable:

```text
src-tauri\target\debug\mori-browser-native-host.exe
```

## Runtime

`mori-browser-native-host` is the Native Messaging host process. The Mori Tauri
GUI executable is not the host. The helper reads framed JSON from stdin, relays
the decoded Browser observation to the running Mori Desktop app through a local
IPC channel, then writes one framed acknowledgement to stdout.

Mori Desktop starts the local relay listener at app startup. The relay name is
versioned and user-scoped by default, and can be overridden for tests or local
debugging with:

```text
MORI_BROWSER_RELAY_NAME
```

The local relay is an implementation detail between Mori-owned processes. The
Browser extension should keep using the Native Messaging protocol and should
not depend on the relay format directly.

## Windows Registration

The prototype scripts register the manifest at user scope, so administrator
rights are not required for the development path.

Chrome:

```powershell
.\install-native-host.ps1 -Browser chrome -HostPath "C:\Program Files\Mori\mori-browser-native-host.exe" -ExtensionId "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

Edge:

```powershell
.\install-native-host.ps1 -Browser edge -HostPath "C:\Program Files\Mori\mori-browser-native-host.exe" -ExtensionId "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

Uninstall:

```powershell
.\uninstall-native-host.ps1 -Browser chrome
.\uninstall-native-host.ps1 -Browser edge
```

The scripts write the host manifest under:

```text
%LOCALAPPDATA%\Mori\NativeMessagingHosts\com.swarea.mori.browser.json
```

and register the manifest path under one of:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.swarea.mori.browser
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.swarea.mori.browser
```

## Windows Installer Registration

The Mori Windows installer owns production-shaped registration. It packages the
Rust helper executable with the desktop app and, when a build supplies an
explicit extension id, runs these scripts from the installed resources during
install and uninstall.

Build-time inputs:

```text
MORI_BROWSER_CHROME_EXTENSION_ID=<32-character Chromium id>
MORI_BROWSER_EDGE_EXTENSION_ID=<32-character Chromium id>
```

No extension id is invented in source. If the build does not provide one, the
installer still carries `mori-browser-native-host.exe` but does not register a
Native Messaging host. Local packaged smoke may provide the unpacked extension
id for that temporary test build. A public release must use the stable store
identity.

Uninstall is ownership-aware for installer use: when `-ExpectedManifestPath` is
provided, a browser registry key is removed only if it still points at that
manifest path. This prevents Mori uninstall from deleting a different user or
development Native Messaging registration.

## Runtime Invariant

Native Messaging stdout is the framed protocol channel only. Diagnostics must
go to stderr. If Mori Desktop is not running or its relay cannot be reached,
the helper returns a framed `mori_unavailable` acknowledgement.
