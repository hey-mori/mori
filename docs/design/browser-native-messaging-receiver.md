# Browser Native Host Relay

Status: first process-boundary implementation, 2026-09-10.

This note records the first Mori-side Native Messaging process boundary for
Browser observations. It does not connect the production extension transport
client yet, add reconnect behavior, offline queueing, production persistence,
Identity, Work, Sync, Flow, Episode, Memory, or Vision.

## First Chrome E2E Finding

The first real Chrome smoke used Chrome 152.0.7977.83, the unpacked
`swarea/mori-browser-extension`, and the debug helper at:

```text
C:\dev\mori-browser-native-host-dev\src-tauri\target\debug\mori-browser-native-host.exe
```

Chrome assigned this unpacked extension id for the local repository path:

```text
ebkcmfnikempiiafmehofoalnknfoblg
```

That id is development-local registration data and is not committed to source.
The native host manifest was registered for Chrome at user scope with:

```text
chrome-extension://ebkcmfnikempiiafmehofoalnknfoblg/
```

The first successful end-to-end observation was `navigation_committed`.
Chrome produced a sanitized Browser observation, launched
`mori-browser-native-host`, the helper connected to Mori Desktop over local IPC,
Mori routed the observation through `BrowserObservationIngress`, and the
extension received:

```json
{
  "ok": true,
  "kind": "navigation_committed",
  "route": "trace"
}
```

With Mori Desktop stopped, the same path returned a framed failure
acknowledgement to the extension:

```json
{
  "ok": false,
  "code": "mori_unavailable"
}
```

This confirms the process boundary. It does not yet prove Chrome Web Store or
Edge Add-ons distribution ids, packaged installer registration, durable Trace
persistence, reconnect policy, or offline spooling.

## Production Packaging Update 2026-09-10

The first Windows packaging pass makes the Mori desktop installer the owner of
Chrome Native Messaging registration. This changes the production path, but not
the Browser observation contract and not the helper protocol.

- `npm run tauri:build` now runs a Mori wrapper around Tauri build.
- The wrapper requires `MORI_BROWSER_CHROME_EXTENSION_ID`,
  `MORI_BROWSER_EXTENSION_ID`, or `MORI_BROWSER_ALLOWED_ORIGINS` as explicit
  build-time input.
- The wrapper builds `mori-browser-native-host` in release mode and prepares
  Tauri's target-triple `externalBin` file.
- The wrapper generates a temporary NSIS hook and config override under
  `src-tauri/target/mori-browser-native-host/`; generated extension ids are not
  committed.
- The Windows NSIS installer registers Chrome at current-user scope and writes
  `%LOCALAPPDATA%\Mori\NativeMessagingHosts\com.swarea.mori.browser.json`.
- The manifest path points at the installed helper,
  `%LOCALAPPDATA%\Mori\mori-browser-native-host.exe`.
- The Browser extension still knows only the host name
  `com.swarea.mori.browser`.
- Development PowerShell scripts remain diagnostics and smoke-test support.
  They are not the production registration owner.

Still deferred: Edge installer registration, per-machine installer scope,
production extension publication, code signing, release tagging, macOS/Linux
manifest installation, durable Browser Trace storage, history import, DOM
capture, retry/spool behavior, Flow/Episode/Memory interpretation, Identity,
Account, Workspace, Work, Sync, and Vision.

Chrome 152 rejected command-line `--load-extension` in this environment. The
successful automated smoke used the Chrome DevTools Protocol
`Extensions.loadUnpacked` command with `--remote-debugging-pipe` and
`--enable-unsafe-extension-debugging`.

## Reproducible Chrome Smoke Harness

The follow-up reproducible development smoke is owned by
`swarea/mori-browser-extension` rather than Mori. Mori owns the native helper,
local IPC relay, and Browser observation ingress. The extension repository owns
Google Chrome launch, unpacked extension loading, runtime extension id
discovery, popup capture toggling, and browser event driving.

The canonical development flow is:

```text
Start Mori Desktop from C:\dev\mori-browser-native-host-dev.
Build src-tauri\target\debug\mori-browser-native-host.exe.
Run npm run smoke:chrome-native from C:\dev\mori-browser-extension.
```

The smoke harness uses Chrome DevTools Protocol only as development test
control. CDP loads the unpacked extension with `Extensions.loadUnpacked`,
opens the extension popup page, drives tab/navigation actions, and reads
extension storage for assertions. Product Browser capture still flows through
real Manifest V3 extension APIs and real Native Messaging.

The first reproducible smoke run against Chrome 152.0.7977.83 verified:

```text
context_snapshot -> route: context
navigation_committed -> route: trace
tab_activated -> route: trace
capture OFF blocks later Browser evidence
mori_unavailable is returned when the local Mori relay is unavailable
host missing is surfaced when Chrome cannot discover the Native Messaging host
URL credentials, query, and fragment remain stripped before transport
```

The host-missing scenario saves and restores the previous user-scope Chrome
Native Messaging registration. Temporary Chrome profiles are used so the
developer's normal Chrome profile is not touched. The smoke does not add
offline spooling, retry policy, persistence, production installer behavior,
Chrome Web Store identity, Edge Add-ons identity, Flow, Episode, Memory,
Identity, Work, Sync, or Vision.

## Boundary

```text
Browser extension, future
  -> Native Messaging frame bytes over stdin/stdout
  -> mori-browser-native-host helper process
  -> local Mori Desktop relay
  -> WebView acknowledgement bridge
  -> existing TypeScript Browser observation ingress
  -> Browser Context or Browser Trace projection
  -> framed acknowledgement
```

Native Messaging is transport. Browser observation v1 is the cross-repository
wire contract. Browser Context and Browser Trace remain Mori source semantics.

## Desktop Runtime Decision

Do not use the Tauri GUI executable as the Native Messaging host. The desktop
entry point starts the Mori window, plugins, global shortcut, SQLite state, LLM
state, and Tauri command handlers. That process has GUI startup side effects
and normal diagnostics, while Native Messaging requires stdout to stay reserved
for framed protocol bytes.

The dedicated helper process is `mori-browser-native-host`. It speaks the
Chromium Native Messaging stdio protocol and then relays each decoded
`BrowserObservationEnvelope` to the already-running Mori Desktop process over a
local IPC channel.

The previous same-process TypeScript receiver is kept as an architecture probe
and test helper. Production ingestion now routes through:

```text
mori-browser-native-host
  -> Browser relay IPC
  -> Tauri event
  -> BrowserObservationIngress
```

Mori Desktop is not launched by the host. If the desktop relay is unavailable,
the helper returns a framed `mori_unavailable` acknowledgement instead of
buffering observations.

## Local Relay

The local relay uses the `interprocess` crate. On Windows it resolves to a
named pipe; on platforms without namespaced local sockets it falls back to a
temporary filesystem socket path. The relay name is versioned and user-scoped
by default, and can be overridden with:

```text
MORI_BROWSER_RELAY_NAME
```

The local relay payload is newline-delimited JSON:

```json
{
  "version": 1,
  "observation": {
    "version": 1,
    "source": "browser",
    "kind": "tab_activated",
    "observedAt": "2026-09-09T00:01:00.000Z",
    "payload": {}
  }
}
```

The reply body mirrors the Native Messaging acknowledgement:

```json
{
  "ok": true,
  "kind": "tab_activated",
  "route": "trace"
}
```

## Protocol Findings

Chrome and Edge start native hosts as separate processes and communicate over
stdin and stdout. Messages are UTF-8 JSON prefixed with a 32-bit length in
native byte order. `runtime.connectNative()` keeps the host alive for the port
lifetime, while `runtime.sendNativeMessage()` starts a host per request and
uses the first host response. Chrome caps host-to-browser messages at 1 MB and
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

Host name:

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

During local development, the debug helper built by Cargo is usually:

```text
src-tauri\target\debug\mori-browser-native-host.exe
```

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

The relay is local process-to-process transport, not a semantic boundary.
Browser-specific data remains inside the Browser observation envelope and
Browser source model; Trace core must stay source-neutral so later Desktop,
Dev, Terminal, and other sources do not inherit browser-only fields.
