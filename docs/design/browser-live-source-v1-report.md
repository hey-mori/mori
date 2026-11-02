# Browser Live Source v1 Verification

Date: 2026-09-13. Contract: BrowserObservationEnvelope v1.

## A. Baseline

- Mori: `0ef2539e36195745a6e5351b394021341b3ce55c`.
- Extension: `2dd4441cdb3c8f4801ed604c6479889fe6541c9b`.
- Work used a clean Mori worktree and the separate extension checkout. The
  original dirty Mori checkout and its unrelated AI migration were left alone.

## B. Existing Product Gap

The relay acknowledged the source ingress result and discarded it. Accepted
snapshots/events had no application owner, durable store, or visible health.
They did not feed records, timelines, history, or semantic memory.

## C. Persistence Audit

The existing SQLite database already owns migrations, backup, locking, reset,
and storage location. Session events require a session/project; kernel records
have apply/review semantics; durable documents replace an owner's whole JSON.
V012 therefore adds an indexed `browser_evidence` table in that same database.
It does not create a second database or generic persistence framework.

## D. Context Semantics

The application retains one last-observed snapshot in memory, not history.
Older snapshots from the same runtime do not overwrite newer ones. Receipt
freshness expires after 60 seconds; the last snapshot remains labeled as such.
Restart begins unknown. A trace ACK can request one fresh snapshot through the
additive `contextRequired` hint. This is not exact live tab inventory.

## E. Trace Semantics

`tab_activated` and `navigation_committed` append allowlisted evidence with
observed time, received time, delivery identity and SQLite sequence. They retain
runtime/tab/window identifiers, sanitized URL and supported transition flags.
`recentEvidence()` reprojects rows through the existing Browser normalizer.

## F. Evidence Boundary

The application injects a consumer into the relay. Trace core and source
normalization do not import application storage or UI. No session, project,
record, Flow, Episode, Memory, identity or task is inferred from these events.
Vision remains unimplemented.

## G. ACK Contract

- Context success: the current-state sink accepted the snapshot, including its
  explicit out-of-order policy.
- Trace success: SQLite committed the row, or already holds that identical
  relay delivery. Storage rejection returns `persistence_failed` with no raw
  payload, SQL error or filesystem path.
- Lost ACK after commit is possible. Failure is not a guarantee of no write.
- The native helper preserves the optional recovery hint without changing v1.

## H. Dedupe And Ordering

Only the same relay delivery is idempotent. A conflicting reuse is rejected;
matching observations in different deliveries remain separate. There is no
stable cross-process observation id, retry queue or exactly-once claim.
Reads order canonical UTC observation time, then sequence. Arrival and browser
callback order need not match. Activation time is captured before async lookup.

## I. Durability

Two complete Chrome runs forcibly stopped only the test Mori process, reopened
its same database and compared every recent row before/after. Both matched.
Rust tests also cover V011-to-V012 upgrade with existing durable documents,
connection reopen, read-only failure, conflict, ordering and explicit reset.
This preserves Mori's WAL NORMAL process-restart guarantee, not a new
power-failure durability guarantee.

## J. Mori Source Health

Settings > Connections shows Browser directly, outside the collapsed advanced
import section. It shows recent receipt or connection unconfirmed, last kind
and time, last snapshot counts/freshness, and private application errors.
Consent belongs to the extension. Silence cannot distinguish OFF, idle, a
closed browser or a broken connection, so Desktop does not claim capture is ON.

## K. Extension UX

The popup exposes a labeled capture checkbox and user-facing delivery status.
It distinguishes Mori unavailable from a missing/broken native-host connection,
and reports storage failure separately. A stale ACK is not shown as a current
connection. The privacy disclosure remains visible. Capture is still opt-in.

## L. Debug Surface

Snapshot counts, recent-event count and manual refresh are under collapsed
Diagnostics. Manual refresh cannot read or save a snapshot while OFF.
Console observation logging contains only source and kind, not event payloads.

## M. Startup Matrix

| Scenario | Verified result |
| --- | --- |
| Mori before Chrome | Opt-in snapshot and durable events accepted |
| Chrome while Mori stopped | Mori unavailable, no offline spool |
| Mori restart | Stored rows preserved; next activity recovers context |
| Chrome restart | Local opt-in preserved; next navigation stored |
| MV3 worker restart | Opt-in preserved; subsequent event reaches SQLite |

Windows logout/reboot and an unattended multi-day run were not executed.

## N. Privacy

Both real runs gated a live worker's window lookup, waited until it entered,
turned capture OFF, and released the late result. No row was appended. Ten
additional OFF navigations also left the rows unchanged. Unit tests explicitly
enter pending tab/window/bootstrap/navigation lookups before disabling capture.
Stored test rows contained no query token, fragment or page title. Rust rejects
unknown fields and unsafe URLs independently. OFF does not erase delivered
evidence and cannot revoke a send already in transit.

## O. Volume And Soak

Chrome `152.0.7977.83`; WebView2 `152.0.4191.66`; Windows x64.

| Measurement | Run 1 | Run 2 |
| --- | ---: | ---: |
| Synthetic main-frame navigations | 60 | 60 |
| Appended deliveries during soak | 99 | 99 |
| Soak duration (ms) | 19,315 | 21,904 |
| Uncompressed read-model JSON bytes/event | 414.76 | 416.78 |
| WebView JS heap before (bytes) | 5,099,012 | 5,125,984 |
| WebView JS heap after (bytes) | 4,634,952 | 4,994,276 |
| WAL before (bytes) | 708,672 | 708,672 |
| WAL after (bytes) | 2,426,712 | 2,426,712 |
| Failure/last transport error | none | none |

The main DB was 4,096 bytes with a 32,768-byte shared-memory file during these
runs. Ignoring the WAL would severely understate storage. WAL growth includes
page/index write amplification and pending checkpoint work, not just logical
event bytes. Heap snapshots do not prove absence of native-process leaks.
This short intensive synthetic rate is not representative daily usage.

Mori owns retention. v1 never silently deletes history; reads cap at 200, while
explicit app reset clears the table. Extension outstanding sends cap at 32
with a ten-second timeout; the relay admits at most 16 concurrent connections.
Timeout disconnects the FIFO port to avoid matching a stale ACK to a new send.

## P. Mori Tests

`scripts/check.sh --full` passed: typecheck, 3,427 Vitest tests (6 skipped),
stylelint, prose check, Vite build, Cargo check and tests. Rust: 282 application
tests passed (2 intentionally ignored), 4 native-host tests passed. The existing
chunk-size and unused-inventory warnings remain advisory. A pre-existing
`connectors/lens.rs` test import warning was not changed by this milestone.

## Q. Extension Tests

`npm run check` passed all 34 tests, validation, deterministic package creation
and staged ZIP inspection. The allowlist includes the new popup state module.
No permissions, content scripts, host permissions or remote scripts were added.
The Store screenshot is a fresh 1280x800 Chrome rendering with capture OFF.

## R. Cross-Repository E2E

The real Chrome harness verifies Context on the actual Mori settings surface
and reads rows through Mori's Tauri read API, not a test-only storage mock or
direct SQL. Both full runs passed all 14 lifecycle/privacy scenarios.
Reports and screenshots are retained locally under:

- `%TEMP%/mori-browser-live-tjCaat/`
- `%TEMP%/mori-browser-live-YDp0OO/`

Desktop was a release build of this code with test-only DevTools instrumentation;
the native helper was the release helper. No test feature enters production
configuration. A fresh WebView profile initially failed to expose CDP; after
also isolating APPDATA and LOCALAPPDATA, both complete runs started without that
retry. The exact ambient-runtime cause is unresolved. The harness records a
bounded optional warm-up retry instead of silently claiming cold-start success.

Earlier verification found and corrected a hidden health section, an invalid
assumption that creating blank tabs always emits a capturable activation, and
a stale Chrome DevTools endpoint when reusing a profile. None is counted as a
successful full run. Final packaged-sidecar verification is recorded below.

The final run used the exact sidecar file prepared for NSIS at
`src-tauri/binaries/mori-browser-native-host-x86_64-pc-windows-msvc.exe`.
It passed all 15 scenarios, including keyboard opt-in, 20 navigations and 33
additional deliveries, with no failure. Its report is under
`%TEMP%/mori-browser-live-LBmJdV/`. The settings surface was visually checked
at 1440-wide and minimum 1180x760 viewport sizes; the popup's OFF and missing
host states were also inspected. No overlapping or clipped status text was
observed. The sidecar SHA-256 matches the normal release helper:
`022db58e8ba6b18bb83013370a4ca12df9662bc36e8b6062cf7b8289915401e7`.

A normal, uninstrumented Tauri release and Windows NSIS installer were rebuilt
after the instrumented desktop executable was copied outside the build tree.
The production configuration contains no DevTools override or Store identity.
This run temporarily registered the packaged sidecar and restored registration;
it did not repeat the previous milestone's installed NSIS uninstall/reinstall
test or publish the installer.

## S. Mori Git

Issue: [#122](https://github.com/hey-mori/mori/issues/122).
Work branch: `feat/browser-live-source`. Integration follows the repository's
merge-commit policy. Final commit/merge identities are in the linked PR and the
completion report, since this document cannot embed its own final commit id.

## T. Extension Git

Issue: [#8](https://github.com/hey-mori/mori-browser-extension/issues/8).
Work branch: `feat/browser-live-source`, kept separate from Mori commits.
The companion PR carries its validation and final merge identity.

## U. Store Work

**Chrome Web Store work intentionally deferred.** No account registration,
item creation, Store id, publication, signing, release or tag was performed.
Readiness files remain; screenshot/listing/privacy wording follow the new UI.

## V. Deferred

No SPA same-document capture, new event kinds, focus/close collector, stable
multi-profile identity, Browser timeline, analytics, semantic interpretation,
cross-platform host, offline queue or automatic retention policy was added.
The 200-row read bound needs pagination before becoming a history surface.
Long-duration native memory/disk behavior and machine restart remain follow-ups.

## W. Next Milestone

**Browser evidence history/read model.** The measured missing product surface is
now inspection of durable evidence, not delivery. Add a bounded, paginated
evidence view with clear source times and provenance before semantic inference.
This should not become usage scoring, time-spent analytics or surveillance.
