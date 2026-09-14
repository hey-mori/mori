# Browser Repeat-Run Reliability

Issue: [#132](https://github.com/swarea/mori/issues/132)

## Scope And Baseline

This milestone measures the existing Browser live source. It adds no Browser
observation kind, envelope field, retry, replay, semantic interpretation, or
Store behavior.

The measured source revisions were Mori
`3425b0b37bee094108c8338c7e363ac374d31eb8` and Browser Extension
`a1abdd9c1ae52b9cb9125fa1cef23115e8e1aa45`. Every matrix used these exact
production-shaped artifacts:

| Artifact                       | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `mori.exe`                     | `72fcf42a577a86a7e5cc2f72f0f9a62fac4517db0f6ecb8d92a72b9144001624` |
| `mori-browser-native-host.exe` | `f7a3a654c8e024a741716c357917bbf9b1a3d6d07fb0c87fb0581e23881ad7b8` |
| Extension package              | `1d31c99fe2879125856d904fee2fab52508195fa7055a9304a6f42dcacb1849a` |

The single-run smoke issues one intended first navigation. Its CDP helper does
not replay navigation. The repeated runner invokes independent single runs
sequentially and preserves failures. Run ids remain in harness reports and do
not enter BrowserObservationEnvelope or Trace evidence.

## Harness Audit

Each fresh run owns a new Chrome profile, WebView profile, HOME/APPDATA tree,
relay name, HTTP fixture, OS-selected Chrome debugging port, and OS-selected
WebView debugging port. The same isolated Mori database is intentionally reused
only across Mori restarts inside one run. Evidence assertions use a new sequence
boundary or a run-unique synthetic path, so an older row cannot satisfy them.

The Extension emits the opt-in context snapshot naturally. The smoke no longer
sends an additional manual bootstrap before judging current context. ACK and
durable read-model evidence are recorded separately. Context has no historical
row: its `route:context` ACK and current-context read model are the two proofs.

Chrome's `DevToolsActivePort` is deleted by the existing launcher before a
profile restart. Two repeated full runs nevertheless showed that the old Chrome
process tree could retain the reused profile lock after the root browser process
exited. The Mori smoke now waits on Chrome processes that reference that owned
profile before relaunch. Cleanup diagnostics likewise inspect only Chrome and
WebView processes associated with test-owned profile paths, never personal
browser processes.

## Result Contract

`browser-live-smoke.mjs` reports artifact hashes, profile freshness, ports,
owned root PIDs, directly observable lifecycle timestamps, four first-observation
results, scenarios, storage sizes, failure stage/category, and cleanup. On
failure it records only transport state, ACK kind/code, recent event kinds, and
durable kind counts. URLs and payloads are excluded.

`browser-repeat-soak.mjs` retains each run report and aggregates success counts,
failure categories, hash consistency, first-observation results, and min,
median, p95, and max timing. `--core` stops after context, first navigation, SPA
History API evidence, tab activation, durable reads, and cleanup. It does not
weaken the full smoke.

## Fresh Same-Binary Rapid Matrix

Matrices A, B, and C were one controlled 20-run set: the artifacts were fixed,
all runtime state was fresh, and the next full run began immediately after
cleanup.

| Measurement                                      | Result                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| Full-run success                                 | 12/20                                            |
| First context ACK                                | 19/20 overall, 19/19 after capture became ready  |
| First navigation ACK and durable row             | 19/20 overall, 19/19 after navigation was issued |
| First tab activation ACK and durable row         | 18/20 overall, 18/18 after its stage was reached |
| First History API ACK and durable row            | 19/20 overall, 19/19 after its stage was reached |
| Root PID, port, native-host and registry cleanup | 20/20                                            |
| Artifact hash consistency                        | 20/20                                            |

One run stopped before capture because Mori's WebView never became application
ready. No run that issued its intended first navigation lost that navigation.
The historical residual first-navigation miss was therefore not reproduced in
the canonical cold-start segment.

### Timing In Milliseconds

| Stage                                 | Count |   Min | Median |    p95 |    Max |
| ------------------------------------- | ----: | ----: | -----: | -----: | -----: |
| Mori WebView ready from run start     |    19 |  2259 |   3083 |   6919 |   6919 |
| Chrome CDP ready after spawn          |    19 |   660 |    861 |   4194 |   4194 |
| Capture enabled from run start        |    19 |  4416 |   7817 |  24899 |  24899 |
| Context ACK after capture             |    19 |   124 |    329 |   5307 |   5307 |
| First navigation durable evidence     |    19 |   145 |    417 |   7314 |   7314 |
| First tab activation durable evidence |    18 |   168 |    287 |    827 |    827 |
| First History API durable evidence    |    19 |   138 |    223 |   1294 |   1294 |
| Full run duration                     |    20 | 34932 |  71699 | 126180 | 128948 |

The 15-second evidence wait exceeded the measured 7.3-second maximum. The
30-second application wait exceeded the measured 6.9-second successful maximum.
These samples do not justify increasing fixed sleeps or replaying evidence.

## Diagnostic Reuse Matrices

These deliberately small two-run probes isolate variables; they are not
statistical reliability claims.

| Matrix                   | Runtime changes         | First-observation result | Cleanup                     |
| ------------------------ | ----------------------- | ------------------------ | --------------------------- |
| Fixed WebView debug port | Fresh profiles and HOME | 4 kinds 2/2              | 2/2                         |
| Reused Chrome profile    | Fresh WebView and HOME  | 4 kinds 2/2              | Observer invalid; see below |
| Reused WebView profile   | Fresh Chrome and HOME   | 4 kinds 2/2              | 2/2                         |

The first Chrome-profile probe's process observer matched the parent runner
because the profile path appeared in its command line. Both functional runs
passed, both reports were conservatively marked cleanup failures, and the two
reported PIDs disappeared with the runner. The observer was then restricted to
`chrome.exe` and `msedgewebview2.exe`. The result is retained rather than
rewritten or repeated.

Port reuse and profile reuse alone did not reproduce a first-observation miss in
these bounded probes. The sample is too small to claim those conditions are
generally reliable.

## Restart And Failure Classification

The 20 full runs exercised Mori-first 19 times, Chrome-first recovery and Mori
restart 17 times, MV3 worker restart 17 times, soak 16 times, and Chrome restart
12 times before the respective runs ended. Failures were:

| Category                         | Count | Evidence                                                                                            |
| -------------------------------- | ----: | --------------------------------------------------------------------------------------------------- |
| Chrome startup/profile lifecycle |     2 | Reused profile lock remained held during in-run Chrome restart                                      |
| Mori/WebView readiness           |     2 | Application-ready CDP evaluation timed out                                                          |
| Extension popup readiness        |     1 | Popup document did not become ready after Chrome restart                                            |
| Later evidence persistence       |     3 | One Chrome-restart navigation, one soak navigation, and one later History API action were not found |

An additional final-candidate attempt passed all four cold-start observations
and Mori recovery, then missed the navigation intended to wake a stopped MV3
worker. These later evidence misses occurred after the first-observation gate.
The old reports did not preserve enough ACK state to distinguish collector,
transport, and persistence for those misses. The enhanced failure diagnostics
exist for the next reproduction; assigning them to product code now would be
guesswork.

The repeated full matrix kept no stale native host, changed registry value,
occupied test port, Mori root process, or Chrome root process. Its database main
file stayed at 4096 bytes when created, while WAL size ranged up to 1,462,632
bytes according to how far a run progressed. The data does not show monotonic
cross-run growth because every run used a fresh database. No memory-leak claim
is made.

## Decision

There is no measured Browser cold-start first-navigation product defect in runs
that reached the navigation stage. There is a proven Chrome profile-lifecycle
gap in the harness, now guarded by an observable process condition. Remaining
later restart/soak misses are real failed runs but are not yet localized. No
production Mori or Extension code changes are justified.

Canonical smoke requires owned processes, isolated user data, exact registry
restoration, bounded readiness waits, and cleanup verification. Fresh runtime
remains the release gate; state reuse remains diagnostic.

The final full fresh candidate again passed all four first observations, Mori
recovery, and MV3 worker restart. It then stopped at soak navigation 11: the
durable API contained the preceding ten soak navigations but not the intended
next row, and the Extension debug state did not respond during failure capture.
Enhanced cleanup passed with no owned Chrome/WebView profile process, native
host, changed registry value, Mori/Chrome root process, or occupied WebView
port. The full canonical result is therefore failed, not retried into a pass.

Chrome Web Store identity and publication remain intentionally deferred.

After measurement, the normal release Native Host was rebuilt and staged at
`src-tauri/binaries/mori-browser-native-host-x86_64-pc-windows-msvc.exe` for
the Tauri/NSIS path. The release helper and staged sidecar both had SHA-256
`bf81fbae6c2896b68f7815e175963640d49d58b363379227c5d3f41944e1dfa4`.
This post-measurement build used no WebView instrumentation and is not presented
as one of the fixed artifacts in the matrix above.
