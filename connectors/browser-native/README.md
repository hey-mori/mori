# Mori Browser Native Host

This folder records the Native Messaging install model for the Mori Browser
receiver.

The Browser extension lives in `swarea/mori-browser-extension`. Mori owns the
native host executable, the installed host manifest, and the Windows registry
lifecycle for the desktop package.

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
  "path": "C:\\Users\\alice\\AppData\\Local\\Mori\\mori-browser-native-host.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"]
}
```

`allowed_origins` is generated from explicit extension ids or explicit
`chrome-extension://<id>/` origins. Development, Chrome Web Store, and Edge
Add-ons ids must be configured separately when they are known. Do not commit a
temporary unpacked extension id as a permanent Mori identifier.

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

## Production Packaging

The Windows desktop installer owns production registration. Run the packaged
build with an explicit build-time extension identity:

```powershell
$env:MORI_BROWSER_CHROME_EXTENSION_ID = "<chrome extension id>"
npm run tauri:build -- --bundles nsis --ci
```

or:

```powershell
$env:MORI_BROWSER_ALLOWED_ORIGINS = "chrome-extension://<chrome extension id>/"
npm run tauri:build -- --bundles nsis --ci
```

The build wrapper:

1. builds `src-tauri`'s `mori-browser-native-host` release binary;
2. copies it to Tauri's target-triple `externalBin` location;
3. generates a temporary NSIS hook and config override under
   `src-tauri/target/mori-browser-native-host/`;
4. embeds the explicit allowed origins in the installer hook;
5. lets the installer write the manifest and Chrome registry key at install
   time.

The generated installer uses current-user scope on Windows. It installs the app
and helper under:

```text
%LOCALAPPDATA%\Mori
```

and writes the Native Messaging manifest under:

```text
%LOCALAPPDATA%\Mori\NativeMessagingHosts\com.swarea.mori.browser.json
```

The manifest points to the installed helper:

```text
%LOCALAPPDATA%\Mori\mori-browser-native-host.exe
```

No production manifest should point at a checkout, `C:\dev`, or
`target\debug`.

Uninstall removes the Chrome registry key and the installer-owned manifest only
when the registry value still points at the installer-owned manifest path.

## Development Diagnostics

The PowerShell scripts in this folder are diagnostics for development and smoke
tests. They are not the production registration owner.

During local development, build the helper with Cargo and point the diagnostic
manifest at the debug executable:

```text
src-tauri\target\debug\mori-browser-native-host.exe
```

Chrome:

```powershell
.\install-native-host.ps1 -Browser chrome -HostPath "C:\dev\mori\src-tauri\target\debug\mori-browser-native-host.exe" -ExtensionId "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

Edge:

```powershell
.\install-native-host.ps1 -Browser edge -HostPath "C:\dev\mori\src-tauri\target\debug\mori-browser-native-host.exe" -ExtensionId "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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
