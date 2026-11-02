# Browser Context ADR

Status: accepted, 2026-09-09. Implementation status updated 2026-09-13.

This ADR records the boundary chosen before Browser implementation began. That
boundary remains authoritative. The implementation has since progressed through
the separate Chromium extension, packaged Native Messaging host, loopback relay,
durable Browser evidence, current Context, and paginated evidence history. The
current engineering reports are
[`browser-live-source-v1.md`](browser-live-source-v1.md) and
[`browser-evidence-history.md`](browser-evidence-history.md).

This ADR defines where browser activity belongs in Mori. The decision itself
did not implement a browser extension, watcher, collector, database, auth
package, identity package, Vision module, Mori Work module, or generic watcher
framework; subsequent milestones implemented only the bounded Browser path
listed above.

## A. Problem

Mori needs browser activity because much of a user's work happens through
pages, tabs, profiles, and accounts. Treating this as flat URL history would
lose the structure Mori needs later: which browser profile was active, which
tab moved through which resources, which workspace the user meant to resume,
and which external persona may have been involved.

The architectural risk is letting Browser become either too small or too large.
Too small means `url + timestamp` with no recoverable context. Too large means
Browser starts owning Flow, Episode, Identity, account sync, or semantic memory.
The chosen boundary is:

```text
Browser Context = WHAT IS
Browser Trace   = WHAT HAPPENED
Mori Core       = WHAT DID IT MEAN
```

The former Yusid direction is absorbed here as Mori browser architecture. Yusid
does not survive as a separate product, repository, package, or namespace.

## B. Existing Mori Constraints

Repository findings at decision time that constrained this ADR:

- `src/lib/trace/core/traceTypes.ts` already defines source-neutral
  `TraceSourceDescriptor`, `TraceEvent`, `TraceSpan`, and `TraceMetadata`.
- `src/lib/trace/sources/ai` and `src/lib/trace/sources/terminal` prove Trace
  is not AI-only. Trace sources project observed evidence and do not own import,
  storage, session mutation, record-kernel writes, analysis, or memory.
- `src/lib/trace/sources/browser/README.md` was only a placeholder. No browser
  collector existed at decision time.
- `docs/trace-architecture.md` says Trace core has no URL, tab id, browser
  profile, account, or agent-only fields. Browser-specific data belongs in
  browser source metadata or browser-local observations.
- `src/lib/sources/sourceRegistry.ts` has a manual `url` integration and a
  planned `browserTab` integration. The manual URL path says Mori does not scan
  tabs. The planned browser-tab path says it requires an explicit browser
  extension and does not capture page content.
- `docs/account-profile-settings-references.md` establishes Local Profile as
  default, Mori Account as optional, and authentication as separate from data
  access. It also says there is no account model, device model, or account
  security session model today.
- `docs/live-project-intelligence.md` keeps explicit connection, no hidden
  scraping, and "automatic collection is not automatic application" as product
  constraints.
- `docs/design/mori-context-workspace-architecture.md` moves long-term Mori
  toward a record ledger with `KernelContext`, `Source`, `SourceLink`,
  `Entity`, `Relation`, `Derivation`, and `Revision`. Interpretation remains a
  Core concern.

These constraints mean future Browser work should fit the current Trace
contract first. Changing Trace core requires evidence from an actual browser
implementation that metadata and source-local models cannot carry the need.

## C. Domain Findings

Browser is not one entity. It is a stack:

```text
Device
  BrowserInstallation
    BrowserProfile
      WindowInstance
        TabInstance
          Resource / URL
```

The important split is between runtime instances and durable logical
references.

- A tab is a runtime instance. It can navigate through many resources.
- A URL/resource is a durable reference candidate. It can appear in many tabs,
  windows, profiles, or saved contexts.
- A profile is browser-local structure, not a person and not one identity.
- An account or identity may be inferred or linked through explicit evidence,
  but Mori must not scrape private account stores to discover it.
- A browser workspace can mean several things: a tab/window grouping, a saved
  tab set, the current task context, or a Mori-wide resumable context. These
  should not be collapsed into one model.
- Current Mori code already uses "browser" to mean the web-app runtime and
  localStorage in persistence paths. Browser activity architecture must avoid
  confusing that with the future Browser Trace source.

## D. Context vs Trace

Browser Context represents current or structural state:

- which device and browser installation is being observed;
- which profile is active;
- which windows and tabs exist now;
- which tab is focused now;
- which resource a tab currently points at;
- which saved browser workspace or resume manifest exists.

Browser Trace records observed temporal facts:

- `browser_started`, `browser_stopped`;
- `window_created`, `window_closed`, `window_focused`;
- `tab_created`, `tab_closed`, `tab_activated`, `tab_moved`;
- `navigation_started`, `navigation_committed`;
- `profile_activated`;
- `context_parked`, `context_resumed`, `context_handed_off`.

Trace events may reference Browser Context ids in source-specific metadata, but
Trace does not own the Context objects. Browser Context should not store
temporal history as its own private log. If a state changed over time, the
change is Trace.

Semantic event names such as `research_started`, `coding_session`, or
`working_on_project` do not belong in Browser Trace. Those are Core
interpretations over evidence.

## E. Runtime vs Durable

Runtime state and resumable state must be separated.

| Candidate              | Classification                           | Reason                                                                                                                            |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Device`               | durable logical candidate                | A named local machine can matter for provenance and future sync, but Local Mode has no account-level device model today.          |
| `BrowserInstallation`  | device-local durable candidate           | Chrome or Edge installation is stable enough to scope profiles and runtime observations.                                          |
| `BrowserProfile`       | device-local durable candidate           | It groups cookies, extensions, bookmarks, and active sessions, but it is not equal to a Mori identity.                            |
| `WindowInstance`       | ephemeral runtime                        | Browser window ids are runtime handles and should not be reused as durable saved-context ids.                                     |
| `TabInstance`          | ephemeral runtime                        | A tab can navigate, reload, duplicate, and disappear. It should be referenced by observations, not treated as a durable resource. |
| `Resource / URL`       | durable reference candidate              | The same resource can be revisited across tabs, devices, and time.                                                                |
| `Navigation`           | Trace event                              | It is an occurrence, not state.                                                                                                   |
| `SiteSession`          | runtime/private state candidate          | It represents authenticated site state. Mori should not inspect it without an explicit connector permission.                      |
| `Saved/Parked Context` | durable candidate                        | A user-intended resumable set of resources and metadata, distinct from live window/tab handles.                                   |
| `Identity`             | cross-device logical candidate, deferred | It may become durable when Mori Account or explicit account linking exists. It is not owned by Browser today.                     |

## F. Entity Model Candidates

- `Device`: a local execution environment. Candidate owner is Context/Platform,
  not Trace. It may later be account-scoped, but pure Local Mode must not show a
  fake synced device graph.
- `BrowserInstallation`: a browser runtime on one device, such as Chrome Stable.
  Candidate owner is Browser Context.
- `BrowserProfile`: a browser-local environment. It may contain many external
  accounts and site sessions. Candidate owner is Browser Context.
- `WindowInstance`: an ephemeral runtime container for tabs. Browser Context can
  expose the current snapshot; Trace records lifecycle/focus events.
- `TabInstance`: an ephemeral runtime handle. Browser Context exposes current
  state; Trace records creation, activation, movement, navigation, and closure.
- `Resource / URL`: a durable reference candidate. It may later map to the
  record-kernel `Source` or a source-document record, but Browser should start
  with a source-local representation until the first implementation proves the
  persistence shape.
- `Navigation`: Trace only.
- `SiteSession`: open question. It is not the same as Account. It is sensitive
  authenticated browser state and should stay out of MVP.
- `Account`: external service account candidate. It is not Mori auth and not
  automatically granted by Mori sign-in.
- `Identity`: external digital persona candidate. It may link accounts,
  profiles, and contexts, but ownership is deferred.
- `Browser Workspace`: ambiguous. Keep it browser-local unless a real
  cross-source resumable need appears.
- `Saved/Parked Context`: durable resume manifest candidate. It should store
  resources and user intent, not runtime ids as permanent identity.

## G. Identity / Account Relationship

Auth and identity are separate:

```text
Auth     = proving a user to Mori infrastructure
Identity = a persona/account set used in external digital environments
```

Current Mori has a local profile surface and planning docs for an optional Mori
Account. It does not have a real account, device-session, browser identity, or
cross-device identity model.

The safe future shape is relationship-based rather than profile-based:

```text
BrowserProfile
  has observed site sessions or explicit account links
ExternalAccount
  belongs to, or is associated with, an Identity candidate
Identity
  may span multiple accounts, profiles, devices, and Mori contexts
```

A Browser Profile must not be assumed to equal one Identity. A single profile
can contain personal Google, work GitHub, OpenAI, Slack, and other accounts. A
single identity can also appear across multiple browser profiles or devices.

For the Browser MVP, Identity and Account should be explicit metadata only when
the user provides it or when a connector with clear permission supplies it.
Browser must not infer identity from cookies, private browser stores, or page
content scraping.

## H. Workspace / Park / Resume / Handoff

`Browser Workspace` has four possible meanings:

1. browser-local tab/window grouping;
2. saved tab set;
3. current task context;
4. Mori-wide resumable work context.

The first two can belong to Browser Context. The third is likely a Core
interpretation or a `KernelContext` association. The fourth is still a Mori Work
hypothesis.

Park, Resume, and Handoff are operations, not Trace responsibilities:

```text
Command / user action
  -> Context or orchestration mutates state
  -> Trace records that the mutation happened
```

Examples:

- Parking changes a saved/resumable context from active to parked. Trace may
  record `context_parked`.
- Resuming changes a parked context back toward active runtime state. Trace may
  record `context_resumed`.
- Handoff exports or transfers a resumable context to another surface, person,
  or device. Trace may record `context_handed_off`.

Trace never performs the mutation. Trace only preserves evidence that it
occurred.

## I. Mori Work Hypothesis

Mori Work remains deferred.

The hypothesis is useful:

```text
Work = cross-source, persistent, resumable, user-meaningful context
```

But the current repository already has `KernelContext` for project, workstream,
topic, area, routine, person, and custom groupings. It also has session/project
grouping and future workroom notes. Browser evidence does not yet prove that a
new `Work` domain object is needed.

Keep this distinction:

- `TraceSpan`: observable temporal continuity only.
- `Flow`: Core-interpreted temporal activity.
- `Work`: possible cross-source resumable context, not implemented.

The first Browser implementation should attach browser evidence to existing
contexts before creating a new Mori Work model.

## J. Ownership Matrix

| Concept              | Owner / Candidate Owner                    | Meaning                                     | Durability                | Scope                         | Notes / Open Questions                                          |
| -------------------- | ------------------------------------------ | ------------------------------------------- | ------------------------- | ----------------------------- | --------------------------------------------------------------- |
| Device               | Context/Platform candidate                 | Local execution machine                     | Durable candidate         | Device, later account         | No real device model today. Do not fake sync in Local Mode.     |
| BrowserInstallation  | Browser Context                            | Installed browser runtime                   | Device-local durable      | Device                        | Scopes profiles and runtime observations.                       |
| BrowserProfile       | Browser Context                            | Browser-local environment                   | Device-local durable      | Browser installation          | Not equal to one Identity.                                      |
| Window               | Browser Context                            | Runtime window instance                     | Ephemeral                 | Browser runtime               | Trace records lifecycle/focus.                                  |
| Tab                  | Browser Context                            | Runtime tab instance                        | Ephemeral                 | Window/runtime                | Trace records tab events.                                       |
| Tab activated        | Trace                                      | Observable focus event                      | Event                     | Browser source                | References tab/window/profile metadata.                         |
| Navigation           | Trace                                      | Observed resource transition                | Event                     | Browser source                | URL/resource in metadata or source-local model.                 |
| Resource / URL       | Browser Context or shared Source candidate | Durable web reference                       | Durable candidate         | Cross-tab, maybe cross-device | Do not use URL as tab identity.                                 |
| SiteSession          | Deferred                                   | Authenticated site-local state              | Runtime/private candidate | Browser profile/site          | Sensitive. Exclude from MVP.                                    |
| Account              | Deferred, possibly Identity/Connectors     | External service account                    | Durable candidate         | Service/account               | Auth to Mori does not grant service data access.                |
| Identity             | Deferred                                   | External digital persona                    | Durable candidate         | Cross-account/profile/device  | Relationship-based; owner not decided.                          |
| Browser Workspace    | Browser Context candidate                  | Browser-local organization or saved tab set | Mixed                     | Browser/profile               | Must not absorb Mori-level task meaning by default.             |
| Saved/Parked Context | Context/orchestration candidate            | Resumable manifest                          | Durable                   | Mori/browser context          | Stores resources/intent, not runtime ids as permanent identity. |
| Park / Resume        | Context operation + Trace evidence         | State mutation plus observed event          | Durable state + event     | Context/orchestration         | Trace records `context_parked` / `context_resumed`.             |
| Handoff              | Orchestration + Trace evidence             | Transfer/export/continuation action         | Durable artifact/event    | Cross-surface                 | Mutation/export outside Trace.                                  |
| Flow                 | Core                                       | Interpreted temporal activity               | Derived                   | Cross-source                  | Never a Trace object.                                           |
| Episode              | Core                                       | Meaningful completed experience             | Derived/durable           | Cross-source                  | Built from evidence and interpretation.                         |
| Memory               | Core                                       | Long-term remembered knowledge              | Durable                   | Mori                          | Governed by review/provenance.                                  |
| Work                 | Deferred hypothesis                        | Cross-source resumable context              | Unknown                   | Cross-source                  | Do not implement until browser + other sources prove need.      |
| Watcher              | Vocabulary only                            | Source-specific observing process           | Runtime                   | Source-specific               | No generic framework yet.                                       |
| Vision observation   | Future Vision                              | Perception from screen/image/video          | Future                    | Visual source                 | Not implemented here.                                           |

## K. Invariants

1. Trace never owns semantic interpretation.
2. Browser Context represents browser/runtime state, not temporal history.
3. Browser Trace events may reference Context, but Trace does not own Context
   objects.
4. Park, Resume, and Handoff mutate Context or orchestration state; Trace only
   records that those actions occurred.
5. Identity may be referenced before its architectural owner is finalized.
6. Browser Profile must not be assumed to equal one Identity.
7. Durable logical entities and ephemeral runtime instances must be explicitly
   distinguished.
8. No generic Watcher framework until multiple real collectors demonstrate the
   same abstraction.
9. No Mori Work domain until a real cross-source resumable-context requirement
   proves it necessary.
10. Browser-specific fields must not leak into Trace core.
11. Browser capture must be explicit, scoped, local-first, and transparent.
12. Automatic collection is not automatic application into durable memory.

## L. Open Questions

- Should `Resource / URL` become a record-kernel `Source`, a `source-document`
  record, both, or only a browser-local reference before import?
- What stable identity can a browser extension provide for profiles without
  exposing private account stores?
- Does Mori need an account-independent `Device` model for local provenance, or
  should Device wait for optional Mori Account sync?
- What is the minimal permission UI for browser capture: per extension install,
  per browser profile, per site, per workspace, or per saved context?
- Can a saved browser context restore enough state with URLs and titles, or does
  it need form state, scroll position, tab groups, or extension data?
- Which handoff target appears first: another browser profile, another device,
  a `.mori` package, an AI resume prompt, or a Mori project/context page?
- When a site account is visible in page chrome, is that valid evidence or too
  close to content/identity inference for MVP?
- How should browser evidence attach to existing `KernelContext` records without
  creating a new Mori Work domain too early?
- What retention policy should apply to titles, URLs, favicons, and page text
  excerpts separately?

## M. Recommended Browser MVP

The next Browser step should be the smallest opt-in vertical slice:

```text
Browser extension or connector
  -> explicit runtime observation
  -> Browser Context snapshot
  -> Browser Trace events
  -> existing import/review/Core path later
```

MVP include:

- Browser installation/provider identity, such as Chrome or Edge.
- Device-local Browser Profile label or opaque id, if the extension can provide
  it without private-store access.
- Runtime Window and Tab instances as ephemeral observations.
- Current tab title and URL/resource reference.
- `tab_activated`, `navigation_committed`, and `history_state_updated` events.
- Source-specific metadata only. No Trace core change unless implementation
  proves it is unavoidable.
- Architecture tests that keep browser metadata out of Trace core.

MVP exclude:

- identity inference;
- account detection;
- site-session inspection;
- page content capture by default;
- browser history import;
- cross-device sync;
- Park/Resume automation;
- Mori Work;
- semantic Flow detection;
- generic Watcher framework;
- Vision.

Question checklist:

- Q1: Context is browser state; Trace is observed browser activity over time.
- Q2: Device, installation, profile, resource, and saved context are durable
  candidates; windows and tabs are runtime; navigation is Trace.
- Q3: Device scopes execution, installation scopes browser runtime, profile
  scopes browser-local environment, window/tab are runtime instances.
- Q4: Yes. URL/resource and tab instance must be separate.
- Q5: Identity, Account, and SiteSession relate to Browser Context through
  explicit relationships/evidence, but ownership is deferred.
- Q6: Yes. One profile can hold multiple external accounts/identities.
- Q7: Browser Workspace starts browser-local; Mori-level Work remains deferred.
- Q8: Context/orchestration performs Park, Resume, Handoff; Trace records events
  that those actions happened.
- Q9: Yes. Runtime Browser Context and Saved/Resumable Context should be
  separate.
- Q10: Current evidence does not justify Mori Work as a concrete domain.
- Q11: Durable logical state may sync later; runtime window/tab handles should
  not sync as identity.
- Q12: Yes. Current Trace architecture can accept Browser through source-local
  metadata without changing Trace core.

## Implementation Feedback 2026-09-09

The first source-local Browser MVP kept the ADR boundary intact.

- Needed now: browser runtime, runtime window id, runtime tab id, active/focused
  state, current resource, tab activation, and navigation committed.
- Not needed now: Identity, Account, SiteSession, Browser Workspace, Park,
  Resume, Handoff, Work, Sync, Vision, and a generic Watcher abstraction.
- Browser APIs do not prove a stable profile identity in this slice. Profile
  remains deferred.
- Runtime and durable separation held: window/tab ids are runtime handles;
  resource URL is a logical reference candidate, represented source-locally.
- Trace core was sufficient. Browser-specific fields stayed in browser metadata
  and source-local observations.
- Privacy default was narrowed: URL credentials are always removed, and the
  default URL policy keeps origin plus path while dropping query and fragment.
  Page content, cookies, form input, and account state are not represented.

Implemented files:

- `src/lib/trace/sources/browser/browserContext.ts`
- `src/lib/trace/sources/browser/browserTrace.ts`
- `src/lib/trace/sources/browser/browserObservationEnvelope.ts`
- `src/lib/trace/sources/browser/browserTrace.test.ts`

## Implementation Feedback 2026-09-09 Runtime Shell

The first Chromium WebExtension shell confirms that the source-local Browser
model can be connected to a real browser lifecycle without changing Trace core.

Repository ownership:

- `hey-mori/mori` owns Browser Context semantics, Browser Trace semantics,
  `TraceEvent` projection, architecture guards, and Core integration.
- `hey-mori/mori-browser-extension` owns the Chromium/WebExtension runtime,
  manifest, permissions, explicit opt-in, browser-side privacy filtering,
  service-worker lifecycle, popup/debug state, packaging, release, and a future
  transport client.
- The process/repository boundary is a stable v1 Browser observation envelope:
  `version`, `source`, `kind`, `observedAt`, and `payload`.
- The extension emits Browser observations, not Mori `TraceEvent` objects.

Extracted shell in `hey-mori/mori-browser-extension`:

- `manifest.json`
- `src/background.js`
- `src/core/moriBrowserExtensionCore.js`
- `src/popup.html`
- `src/popup.js`
- `src/popup.css`
- `fixtures/*.v1.json`
- `tests/moriBrowserExtensionCore.test.mjs`
- `scripts/validate-extension.mjs`
- `README.md`

Runtime identity findings:

- Available: extension runtime label/version from the manifest, provider family
  as a Chromium extension runtime, numeric browser window ids, numeric tab ids,
  active tab state, focused window state, incognito flags exposed on tab/window
  payloads, and current tab URL when permission allows it.
- Unavailable or not trustworthy in this slice: durable browser profile
  identity, Google or site account identity, cross-device identity, workspace
  identity, and a durable logical tab/window identity.
- Decision: do not synthesize a persistent profile id. Runtime window and tab
  ids remain ephemeral Browser Context handles only.

Service worker lifecycle findings:

- Manifest V3 background code runs as a service worker, so in-memory globals are
  not a durable state boundary.
- `captureEnabled` is stored in extension-local storage and defaults to false.
- The debug context snapshot and recent sanitized events are stored only in
  extension session storage. They are development visibility, not Mori
  production persistence.
- On startup, the worker checks persisted opt-in state. If capture is enabled,
  it bootstraps a fresh Context snapshot instead of assuming that previous
  runtime objects are still true.

Context bootstrap:

- Bootstrap uses the current normal browser windows with populated tabs.
- Bootstrap emits a current-state envelope with runtime, window, tab, active,
  focused, and sanitized current-resource fields.
- Bootstrap is not browser history replay. It means "observed browser state at
  this time."
- Capture OFF -> ON runs bootstrap so Mori sees a fresh Context before live
  Trace events.
- Capture ON -> OFF clears extension-session debug snapshot/events. No evidence
  is sent to a production sink because no production transport exists yet.

Event semantics:

- `tabs.onActivated` is mapped to `tab_activated`. This means a tab became
  active in its window; it is not by itself a semantic task switch.
- `webNavigation.onCommitted` is mapped to `navigation_committed` for main-frame
  navigation only. Subframe events are dropped.
- `webNavigation.onHistoryStateUpdated` is mapped to `history_state_updated`
  for main-frame History API URL updates. It remains distinct from a document
  commit and does not mutate Browser Context directly.
- `onCommitted` means the browser has committed to a document transition. It
  does not mean the page finished loading.
- This slice does not observe fragment-only updates, completed loads, navigation
  errors, redirects as a full chain, tab creation, tab closure, or window
  switching as separate events.
- Ordering is represented by observed time and source timestamps only. No global
  sequence coordinator is introduced.

Permission findings:

- Permissions used: `storage`, `tabs`, and `webNavigation`.
- No host permissions are requested, and `<all_urls>` is not requested.
- `tabs` is required because Chromium limits access to tab URL/title data unless
  the extension has `tabs` or suitable host permissions. Mori uses URL and tab
  metadata only after sanitization.
- `webNavigation` is required for committed navigation and History API state
  update events.
- Unused by design: `history`, `cookies`, `webRequest`, `scripting`,
  `downloads`, `bookmarks`, clipboard permissions, content scripts, DOM access,
  and page-content capture.

Privacy findings:

- Capture is explicit and defaults to off.
- URL credentials are always stripped. The default URL policy stores origin plus
  path and removes query and fragment.
- Titles are not collected by default even though the source-local model can
  represent them.
- Browser internal URLs such as `chrome://`, `chrome-extension://`, `edge://`,
  `about:`, and `devtools://` are ignored rather than represented as ordinary
  web resources.
- Incognito/private windows and tabs are not captured. The manifest is
  configured as not allowed for incognito.

Transport decision:

- The shell currently stops at extension-local sanitized Context/Trace envelopes
  and debug visibility.
- No new local HTTP server, WebSocket, native messaging bridge, connector
  transport, global Trace store, or browser history database is introduced.
- Next transport candidates are native messaging or a narrow existing connector
  ingress, but either needs a real Mori-side consumer before becoming part of
  the contract.

ADR adjustment:

- The earlier MVP item "current tab title" is now optional and disabled by
  default. A title-retention policy should be decided before enabling it in a
  production transport.

## Implementation Feedback 2026-09-09 Mori Ingress

Mori now has an explicit Browser observation ingress boundary. The ingress is
transport-neutral and accepts decoded Browser observation envelopes; it does not
know about Native Messaging, HTTP, WebSocket, Chrome APIs, filesystem watchers,
or the extension repository source code.

Ingress responsibilities:

- Validate `version === 1`, `source === "browser"`, known `kind`, valid
  `observedAt`, required payload fields, supported URL policy, and URL privacy
  invariants.
- Reject unsupported future versions instead of interpreting them as v1.
- Route `context_snapshot` to Browser Context.
- Route `tab_activated`, `navigation_committed`, and `history_state_updated` to
  Browser Trace.
- Return accepted/rejected results without throwing for malformed input.

Privacy defense:

- Browser-side filtering remains the primary privacy boundary.
- Mori ingress is a defensive boundary. It rejects URL fields that still contain
  credentials, query, or fragment rather than silently accepting raw browser
  payloads.
- The projection layer still sanitizes URLs when building source-local resource
  objects, so accepted data and derived metadata stay aligned.

Local verification path:

```text
fixture JSON
  -> parse JSON text
  -> validate Browser observation envelope
  -> route through Browser observation ingress
  -> Browser Context or Browser Trace
```

This local path is explicit and test-only. It is not a folder watcher, daemon,
polling loop, or file transport commitment.

Transport investigation:

| Candidate                   | Strengths                                                                                                      | Costs / risks                                                                                                                                                                            | Current recommendation                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Existing connector ingress  | Reuses Mori's explicit local-import UX, review culture, and duplicate/error style. Good development path.      | Connector JSONL currently models reviewed import candidates, while Browser Trace wants low-level Context/Trace evidence. Forcing Browser into connector events would blur semantics.     | Good for explicit fixture/file handoff experiments, not the first live transport.        |
| Native Messaging            | Browser-supported local app bridge, no page host permissions, works offline, natural for extension -> desktop. | Requires native host manifest installation, Windows registry registration, per-browser registration, extension id allow-listing, installer integration, message-size/lifecycle handling. | Best next live transport candidate once Mori has a desktop receiver and installer story. |
| Local HTTP                  | Easy to develop and inspect; Tauri CSP already allows localhost for app-side calls.                            | Requires local server lifecycle, port discovery, CSRF/local-network threat model, and browser extension host permissions if the extension calls it.                                      | Defer until there is a stronger reason than development convenience.                     |
| WebSocket                   | Good for streaming live events.                                                                                | Same server/lifecycle/threat-model issues as HTTP, plus reconnect/backpressure behavior. Overkill for the current low-rate observation contract.                                         | Defer.                                                                                   |
| File-based explicit handoff | Simple, offline, easy to debug, close to existing local connector import.                                      | A watcher would accidentally choose file transport; manual import is not live capture.                                                                                                   | Keep as explicit development/import path only.                                           |

Native Messaging reality check:

- Windows requires a native messaging host manifest registered in the registry.
- macOS and Linux use browser-specific manifest install locations.
- Chrome and Edge need host registration and extension id allow-listing.
- Mori's desktop installer would need to install/update/uninstall that host
  manifest.
- The receiver lifecycle and message-size behavior need a small desktop-side
  protocol before this becomes production transport.

Fixture drift:

- The two repositories intentionally duplicate v1 fixtures for now.
- Longer-term drift checks can be a CI job that compares fixtures from
  `hey-mori/mori-browser-extension`, a release artifact check, JSON Schema, or a
  small protocol package if the contract grows.
- Do not introduce `mori-protocol` while the wire contract is this small.

## Implementation Feedback 2026-09-09 Native Messaging Receiver Prototype

Native Messaging is now validated as the next Mori-side transport boundary, but
not as production browser capture.

Official protocol findings:

- Chrome and Edge start each native messaging host as a separate process and
  communicate through stdin and stdout.
- Each message is UTF-8 JSON prefixed by a 32-bit message length in native byte
  order.
- Chrome caps host-to-browser messages at 1 MB and browser-to-host messages at
  64 MiB. Edge documents a 1 MB host-to-browser cap and a much larger
  browser-to-host cap. Mori's prototype uses a smaller local default cap for
  Browser observations because the current envelope is tiny.
- `runtime.connectNative()` keeps a host process alive for the port lifetime;
  `runtime.sendNativeMessage()` starts a process for a single request and only
  treats the first host response as the response.
- stdout must contain framed protocol bytes only. Diagnostics belong on stderr.
- The first host argument is the extension origin. Windows may also pass a
  `--parent-window=<handle>` argument.

Process decision:

- Do not use the Tauri GUI executable as the Native Messaging host. Mori's
  current `src-tauri/src/main.rs` starts the desktop window, plugins, global
  shortcut, managed SQLite and LLM state, and the command handler surface. That
  process has GUI startup side effects and normal diagnostics that are
  incompatible with stdout purity.
- Prefer a dedicated small host process, provisionally
  `mori-browser-native-host`, for production packaging.
- The current code adds the Mori-side receiver core in TypeScript so the
  receiver can call the existing Browser observation ingress directly. This
  proves the layering before introducing a packaged helper executable.

Implemented prototype path:

```text
Native Messaging frame bytes
  -> native-messaging transport decoder
  -> decoded JSON value
  -> existing Browser observation ingress
  -> Browser Context or Browser Trace projection
  -> framed acknowledgement
```

The receiver does not create `TraceEvent` or `BrowserContextSnapshot` itself. It
only calls `ingestBrowserObservation`, then returns a small acknowledgement:

```json
{ "ok": true, "kind": "tab_activated", "route": "trace" }
```

or:

```json
{ "ok": false, "code": "unsupported_envelope" }
```

Transport and envelope validation split:

- Transport rejects missing headers, empty frames, oversized frames, truncated
  payloads, invalid UTF-8, and invalid JSON before source projection.
- Browser ingress continues to own `version`, `source`, `kind`, `observedAt`,
  payload shape, and URL privacy invariants.
- Native Messaging metadata such as extension origin, port lifetime, registry
  path, or parent window handle is not added to the Browser observation
  envelope.

Host manifest model:

- Host identifier: `com.swarea.mori.browser`.
- Required manifest keys: `name`, `description`, `path`, `type: "stdio"`, and
  `allowed_origins`.
- `allowed_origins` is generated from explicit extension ids. Development,
  Chrome Web Store, and Edge Add-ons ids must be configured separately.
- No temporary unpacked extension id is committed as a permanent identifier.

Windows registration model:

- Chrome user-level key:
  `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.swarea.mori.browser`.
- Edge user-level key:
  `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.swarea.mori.browser`.
- The prototype installer writes the manifest under
  `%LOCALAPPDATA%\Mori\NativeMessagingHosts\com.swarea.mori.browser.json` and
  stores that path as the registry default value.
- User-level registration is preferred for development because it avoids
  administrator rights. Production installers may later choose system-level
  registration when packaging requires it.

Chrome and Edge differences:

- Chrome documents Google Chrome registry locations and browser-specific
  macOS/Linux manifest directories.
- Edge uses Microsoft Edge registry locations first, then can fall back to
  Chromium and Chrome registry locations. Mori still records Edge explicitly
  instead of relying on fallback behavior.
- Edge Add-ons and Chrome Web Store extension ids may differ, so production
  manifests must include every intended extension origin.

macOS and Linux deferred install model:

- Chrome uses browser-specific native messaging manifest directories under
  `/Library/...` or `~/Library/Application Support/...` on macOS and
  `/etc/opt/...` or `~/.config/...` on Linux.
- Edge uses Microsoft Edge specific directories under `/Library/Microsoft/Edge`
  or `~/Library/Application Support/Microsoft Edge...` on macOS, and
  `/etc/opt/edge/native-messaging-hosts` or
  `~/.config/microsoft-edge/NativeMessagingHosts` on Linux.
- No cross-platform installer is implemented in this milestone.

Security boundary:

- `allowed_origins` limits which installed browser extensions can ask the
  browser to launch the host. It is not a general local authorization boundary.
- Any local process that can execute the receiver and write to stdin could send
  bytes shaped like the protocol, so Mori still validates the Browser envelope
  after transport decoding.
- The prototype adds no filesystem, network, Trace store, record-kernel,
  Flow/Episode, Memory, Identity, Work, Sync, or Vision privileges.

Implemented files:

- `src/lib/trace/transports/native-messaging/nativeMessagingProtocol.ts`
- `src/lib/trace/transports/native-messaging/nativeMessagingReceiver.ts`
- `src/lib/trace/transports/native-messaging/nativeMessagingHostManifest.ts`
- `src/lib/trace/transports/native-messaging/nativeMessagingReceiver.test.ts`
- `connectors/browser-native/README.md`
- `connectors/browser-native/install-native-host.ps1`
- `connectors/browser-native/uninstall-native-host.ps1`

Official references:

- Chrome Native Messaging:
  https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- Microsoft Edge Native Messaging:
  https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging
