# Browser Native Messaging Receiver Prototype

Status: prototype, 2026-09-09.

This note records the first Mori-side Native Messaging receiver boundary for
Browser observations. It does not implement the production extension transport
client, a packaged native helper executable, reconnect behavior, offline
queueing, production persistence, Identity, Work, Sync, Flow, Episode, Memory,
or Vision.

## Boundary

```text
Native Messaging frame bytes
  -> transport decoder
  -> decoded JSON value
  -> existing Browser observation ingress
  -> Browser Context or Browser Trace projection
  -> framed acknowledgement
```

Native Messaging is transport. Browser observation v1 is the cross-repository
wire contract. Browser Context and Browser Trace remain Mori source semantics.

## Desktop Runtime Decision

Do not use the Tauri GUI executable as the Native Messaging host. The current
desktop entry point starts the Mori window, plugins, global shortcut, SQLite
state, LLM state, and Tauri command handlers. That process has GUI startup side
effects and normal diagnostics, while Native Messaging requires stdout to stay
reserved for framed protocol bytes.

The production direction is a dedicated small host process, provisionally
`mori-browser-native-host`. The current implementation keeps the receiver core
in TypeScript so it can call the existing Browser observation ingress directly
before a packaged helper executable is introduced.

## Protocol Findings

Chrome and Edge start native hosts as separate processes and communicate over
stdin and stdout. Messages are UTF-8 JSON prefixed with a 32-bit length in
native byte order. `runtime.connectNative()` keeps the host alive for the port
lifetime, while `runtime.sendNativeMessage()` starts a host per request and uses
the first host response. Chrome caps host-to-browser messages at 1 MB and
browser-to-host messages at 64 MiB. Edge also documents the 1 MB
host-to-browser cap and a larger browser-to-host limit.

Diagnostics must go to stderr. The first host argument is the extension origin.
Windows may also pass `--parent-window=<handle>`.

References:

- Chrome Native Messaging:
  https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- Microsoft Edge Native Messaging:
  https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging

## Host Manifest

Prototype host name:

```text
com.swarea.mori.browser
```

The host manifest uses the standard keys:

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
Chrome Web Store, and Edge Add-ons ids must be configured separately, and a
temporary unpacked extension id must not become a committed production
identifier.

## Windows Registration

The prototype install script uses user-level registration:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.swarea.mori.browser
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.swarea.mori.browser
```

It writes the manifest to:

```text
%LOCALAPPDATA%\Mori\NativeMessagingHosts\com.swarea.mori.browser.json
```

and stores that manifest path as the registry default value. This avoids
administrator rights for development. Production packaging may later choose
system-level registration.

## Edge, macOS, and Linux

Chrome and Edge do not have identical lookup models. Edge checks Microsoft Edge
registry locations first and can fall back to Chromium and Chrome locations, so
Mori records Edge explicitly instead of relying on fallback behavior.

On macOS and Linux, host manifests live in browser-specific system or
user-level directories. This milestone records that install model only; it does
not add a cross-platform installer.

## Security

`allowed_origins` limits which installed browser extensions can ask the browser
to launch the host. It is not a complete local authorization boundary because a
local process could execute the receiver and write to stdin directly.

The transport layer rejects malformed framing, oversized payloads, invalid
UTF-8, and invalid JSON. Browser ingress still validates `version`, `source`,
`kind`, `observedAt`, payload shape, and URL privacy invariants. Transport
metadata such as registry path, extension origin, native port, and parent
window handle is not added to Browser observation v1.
