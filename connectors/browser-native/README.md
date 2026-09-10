# Mori Browser Native Host

This folder records the current Native Messaging install model for the Mori
Browser receiver.

The production Browser extension still lives in `swarea/mori-browser-extension`.
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

`allowed_origins` is generated from explicit extension ids. Development,
Chrome Web Store, and Edge Add-ons ids must be configured separately when they
are known. Do not commit a temporary unpacked extension id as a permanent Mori
identifier.

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

## Runtime Invariant

Native Messaging stdout is the framed protocol channel only. Diagnostics must
go to stderr. If Mori Desktop is not running or its relay cannot be reached,
the helper returns a framed `mori_unavailable` acknowledgement.
