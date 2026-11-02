# Browser History State Evidence

Status: receiver implemented for issue
[#128](https://github.com/hey-mori/mori/issues/128). Companion sender:
[`hey-mori/mori-browser-extension#10`](https://github.com/hey-mori/mori-browser-extension/issues/10).

## Boundary

`history_state_updated` records one observable fact: a main-frame Browser
document used the History API to update its URL. It is distinct from
`navigation_committed`, which records a committed document navigation. Neither
event implies a task, project, session, intent, Flow, Episode, or Memory.

Chrome exposes this fact through `webNavigation.onHistoryStateUpdated`. The
separate `onReferenceFragmentUpdated` event is intentionally not captured.
No content script, page patch, polling, Browser History import, or additional
permission is part of this milestone.

## Contract

The event adds one known kind to `BrowserObservationEnvelope` v1. The envelope
shape and payload representation do not change, so a version increment would
not improve compatibility. Receivers remain closed: unknown kinds and future
versions are rejected. Deployment is receiver-first because an older Mori
receiver rejects the new kind while an older Extension simply never sends it.

The source sends the same minimal navigation details already supported by the
Browser evidence row: runtime, tab/window identifiers when available, sanitized
URL, transition type, and transition qualifiers. Document/process identifiers
are not persisted or promoted to Mori identity.

## Privacy

Only top-level HTTP(S) updates are accepted. Credentials, query, and fragment
are removed in the Extension and rejected at Mori ingress and storage if they
remain. DOM, page contents, titles, forms, passwords, cookies, screenshots,
account identity, and session identity are not collected.

Two query-only History API updates may sanitize to the same origin and path.
They remain two observations because privacy minimization does not erase the
fact that Chrome emitted two events. Delivery-id idempotence remains unchanged;
no semantic dedupe or previous-URL cache is added.

## Storage And Reading

V013 rebuilds `browser_evidence` with the expanded kind CHECK, copies every
column including sequence and delivery id, replaces the old table, and recreates
the observed-time index. Explicit sequence copy preserves existing keyset cursor
identity, and SQLite AUTOINCREMENT continues above the migrated maximum.

The existing `(snapshotSequence, observedAt, sequence)` pagination contract,
restart durability, ACK-after-application-write rule, retention behavior, and
current Browser Context remain unchanged. `history_state_updated` is displayed
in the shared Browser activity history as `페이지 경로 변경`; it does not mutate
the current Context snapshot.

## Deferred

Fragment updates, additional Browser events, Browser semantics, analytics,
Identity/Workspace, Flow/Episode/Memory, and Chrome Web Store publication remain
outside this milestone.
