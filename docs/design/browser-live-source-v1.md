# Browser Live Source v1

Starting points: Mori `0ef2539e36195745a6e5351b394021341b3ce55c`, extension
`2dd4441cdb3c8f4801ed604c6479889fe6541c9b`. Store work is deferred.

## Audit

`src/lib/trace/transports/browser-relay/browserObservationRelay.ts` used to
validate/project an observation, discard the accepted result, and acknowledge
success. Neither snapshot nor event reached an application state, database,
record, timeline, or memory. Nothing survived restart.

Mori already owns a mutex-guarded rusqlite connection, WAL database, checked
migrations and pre-migration backups. The existing `events` table requires
session/project ownership. Session imports represent reviewed source imports.
Kernel records carry apply-policy/record semantics. `durable_documents` replaces
whole-owner documents and has no temporal query index. None is an appropriate
place to append unreviewed, session-independent Browser evidence.

The canonical baseline still keeps AI discovery/import adapters in `lib/agents`
and `lib/session`, and explicit Terminal capture in connector/import paths.
Those do not share Browser's current-state plus continuous event write pattern.
No universal repository or collector framework is justified by this audit.
The unrelated AI migration in the original dirty checkout is not this baseline.

## Ownership

The application composes `browserLiveSource.accept` into the relay installer.
The relay knows a consumer function, not a database or concrete application.
`lib/browser` owns consumption, privacy projection, the current-state read model,
and its SQLite bridge. Trace core and Browser normalization remain independent
of storage, UI, and application services.

V012 adds `browser_evidence` to the **existing Mori database**, not a new DB.
Its index supports bounded recent reads ordered by normalized UTC `observed_at`
then storage sequence. The data is a strict Browser evidence projection: runtime
provider/id, tab/window runtime ids, optional sanitized URL and observed
active/focused flags, plus navigation transition metadata. The read model
projects these back through the existing Browser Trace normalizer. A source
TraceEvent's display-oriented id is not used as a uniqueness constraint.

No record/session/project is invented, and no Flow, Episode, Memory, identity,
workspace, time-spent or semantic inference is produced.

## Current Context

One last-observed snapshot is held in application memory. It is replaced, never
appended to historical evidence. A snapshot from the same runtime with an older
observation time cannot overwrite a newer one. The read model retains the
snapshot but labels it stale 60 seconds after receipt. This is a freshness bound,
not a claim that the browser is alive, unchanged, or focused throughout that time.
The three v1 event kinds cannot keep an exact live tab inventory: closes and
window changes are not observed. UI says **last browser state**.

Restart starts with unknown context. A successful trace ACK may include
`contextRequired: true` when the snapshot is absent/stale. The extension then
captures one current snapshot, guarded by consent generation and coalesced
while a refresh is in progress. This is an additive ACK hint, not a new
observation kind or a new envelope version. Old companions ignore the hint.
Old hosts may drop it; use compatible builds for automatic context recovery.
Snapshots remain memory-only even when refreshed during daily use.

Capture OFF and Chrome exit send no observation in v1. Mori cannot distinguish
OFF, idle, closed, or unreachable from silence. Desktop therefore shows recent
receipt / connection unconfirmed, last kind/time and a sanitized application
error; consent is explicitly left to the extension. It must never persist or
restore a last-known ON as current consent. Multiple profiles do not have a
reliable distinct installation identity today; the last snapshot replaces the
previous one and is not a cross-profile inventory.

## ACK, Dedupe And Ordering

`ok:true, route:context` means the accepted snapshot reached the current-state
sink (an out-of-order snapshot may be deliberately ignored).
`ok:true, route:trace` means SQLite committed the evidence or already holds the
identical relay delivery. A write failure returns `persistence_failed` without
SQL, table names, raw payloads or paths. There is no localStorage fallback.

The unique key is the **Mori relay delivery id**, used to make re-claiming the
same pending request idempotent. It is not a semantic observation id. Distinct
deliveries with matching URL/time/tab/kind remain separate, because v1 cannot
prove they are the same observation. Same delivery with different evidence is
rejected. A lost ACK after commit can therefore leave evidence persisted even
though the sender saw failure; no automatic retry or exactly-once claim is made.

`observedAt` orders display; received time and increasing SQLite sequence expose
application ingestion order separately. Callback completion and arrival order
are not assumed equal. Extension activation timestamps are captured before
asynchronous lookup; navigation retains the browser timestamp.

## Privacy And Capacity

The application rebuilds allowed fields before state/storage. Titles and unknown
fields never enter either sink. HTTP(S) URLs must have no credentials, query or
fragment; private windows are rejected. Rust independently rejects unknown row
fields and unsafe URLs. Product diagnostics contain status/kind, not payloads.

OFF invalidates asynchronous collection before send. It cannot revoke an
observation already sent and committed; v1 has no remote cancellation protocol.
No manual diagnostic capture is allowed while OFF. Disconnect clears extension
diagnostic snapshots/events and stops further transmission.

The application drains sequentially, the Rust relay admits at most 16 concurrent
connections, and the extension bounds outstanding sends at 32 with a 10-second
timeout. A timeout drops the port so stale FIFO ACKs cannot match a later send.
No offline queue, retry loop, collector heartbeat or spooling is added. Local
relay draining and visible popup status refresh are not collector heartbeats.

Recent reads cap at 200 rows. This is a **read limit**, not retention deletion.
Mori owns retention, backup and explicit reset; V012 participates in the existing
confirmed data reset. v1 does not silently prune user evidence. Storage failure
stops successful trace ACKs. Measure rows/hour and bytes/row during soak before
choosing an archive/compaction policy; intensive synthetic switching must not be
presented as typical daily traffic. WAL NORMAL survives app process restart;
power-loss durability is not strengthened beyond Mori's existing DB policy.

## Verification Entry

`node scripts/browser-live-smoke.mjs --extension-repo <extension checkout>`
uses a packaged-build Mori executable and native helper, staged extension,
isolated Chrome/WebView profiles, isolated Mori home and relay name, and a local
HTTP fixture. It restores the previous native-host registry value, retains a
JSON report, SQLite DB and screenshots under the reported temporary directory,
and checks actual SQLite read APIs in addition to ACK. It kills only the Mori
test process it starts for crash/restart verification. No Store interaction,
publication, signing or real user data is required.

For release builds, use `--instrument-webview` to make a test-only release
executable with `tauri/devtools` and an API-provided localhost debugging port.
The temporary Tauri override is outside the checkout and no installer is built
in this mode. Neither option is enabled in production configuration. On the
tested WebView2 152 runtime, a fresh profile did not expose its debugging port
until restarted. The harness records and bounds that warm-up retry; it is not
a product reconnect or proof of cold-start debugging support. The underlying
runtime cause is not established. Do not change machine policy to enable
testing. Rebuild the normal production bundle after testing;
the shared release target can contain the instrumented executable meanwhile.

Windows logout/reboot is not automated. Chrome, worker, and Mori restarts test
their separate lifetimes without terminating the user's desktop session.

The full run results and remaining limitations are recorded in the companion
milestone report after verification.
