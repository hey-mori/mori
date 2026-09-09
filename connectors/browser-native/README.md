# Mori Browser Native Host Prototype

This folder records the current Native Messaging install model for the Mori
Browser receiver prototype.

The production Browser extension still lives in `swarea/mori-browser-extension`.
This folder does not implement the extension transport client, the packaged
native helper executable, reconnect behavior, offline queueing, or production
persistence.

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
go to stderr. The Mori Tauri GUI executable is not used as the host process
because it owns app startup, windows, plugins, shortcuts, and normal desktop
logging.
