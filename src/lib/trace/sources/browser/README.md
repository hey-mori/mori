# Browser Trace Boundary

Browser work in Mori owns the source-local Context and Trace semantics. The
Chromium runtime shell now lives in `hey-mori/mori-browser-extension`.

This source is not connected to production transport, persistence path, session
import path, Core interpretation, Identity, Account, Workspace, Park, Resume,
Handoff, Sync, or Vision.

The current architecture decision record is
`docs/design/browser-context-adr.md`.

The implemented source-local modules keep these concerns separate:

- Browser context: runtime, window, tab, and resource observations.
- Browser trace: tab activation and navigation committed events.

Yusid-style ideas belong here as Mori browser concepts, not as a separate product
or repository boundary. The generic Trace core must remain source-neutral; URL,
tab, profile, and account data should live in browser-specific metadata.

The first implemented slice is deliberately tiny:

- `browserContext.ts` models a current-state snapshot: runtime -> window -> tab
  -> current resource.
- `browserTrace.ts` projects source-local browser observations into the existing
  `TraceEvent` contract.
- `browserObservationEnvelope.ts` accepts the stable v1 Browser observation
  messages emitted across the repository boundary.
- `browserObservationIngress.ts` validates decoded v1 envelopes and routes them
  to either Browser Context or Browser Trace.

Repository boundary:

- `hey-mori/mori` owns Browser Context, Browser Trace, Trace projection, and Core
  integration.
- `hey-mori/mori-browser-extension` owns Chromium/WebExtension APIs, permissions,
  explicit opt-in, browser-side privacy filtering, extension lifecycle, debug
  state, and a future transport client.
- The wire shape is a small versioned observation envelope, not Mori's internal
  `TraceEvent`.
- Local fixture import is explicit: tests parse fixture JSON and call ingress
  directly. No filesystem watcher, polling loop, or live transport is implied.

Native Messaging status:

- `src/lib/trace/transports/native-messaging/` owns the first Mori-side framing
  and acknowledgement prototype.
- The transport decodes framed JSON and then calls this source-local ingress.
- This Browser source must not import Native Messaging code.
- The production extension Native Messaging client and packaged native helper
  executable remain future work.
