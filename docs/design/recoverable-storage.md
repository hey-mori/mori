# Recoverable storage · what a Mori backup holds, and how it comes back

Status: approved 2026-10-09 (operator decisions A and B, recovery program); implemented from
PR "durable reopen descriptors" onward. Extends
[`sqlite-source-of-truth-promotion.md`](sqlite-source-of-truth-promotion.md) (the dual-write,
adoption and read-flip machinery this reuses) and
[`passage-capture.md`](passage-capture.md) (archives, passages).

## 1. The problem

Restoring only Mori's storage folder brought back records, passages and archive files, but not
the means to open the preserved sessions: the reopen descriptors, the imported transcripts and,
in practice, the session list itself lived in WebView localStorage. Bytes survived; recovery did
not. Principle: **durable source bytes and the metadata needed to find and open them share one
recoverable unit.**

## 2. Ownership map (desktop, before this program, verified against main e93b44fe)

| Data | Where (before) | Class | Needed for |
|---|---|---|---|
| Kernel records, revisions, contexts (incl. reviewed membership), sources, source links, FTS | SQLite `kernel_*` (V008) | durable user data | records, passages, membership, search |
| Accepted project memory + audit | SQLite `consolidated_*` (V003) | durable user data | memory views |
| Session drafts, analysis (+history), memory bodies, pending reviews, package drafts, user projects, project connections | localStorage, dual-written to SQLite `durable_documents` (V009) | durable user data | session list, analysis, projects |
| Imported transcripts (`mori.sessionImportEntry.*`, legacy `mori.sessionImports.*`) | **localStorage only** (the V004 table is never written) | durable user data | a session's evidence, the kept copy when the original is gone |
| Reopen descriptors (`mori.autoImport.v1`) | **localStorage only** | durable source-navigation metadata | opening any discovered session, reading its archive |
| Archive files `<storage>/archives/claude-code/<sha256>.jsonl` | Mori storage folder | durable user data (point-in-time copy) | preserved conversations |
| Pre-migration snapshots `<storage>/backups/` | Mori storage folder | recovery snapshot | migration rollback |
| Live intake | SQLite `intake_requests` | derived index | project live view |
| Empty-source list, diagnostics log, adoption markers | localStorage | cache | counts, diagnostics |
| Current-session pointer, theme, sidebar, notifications read state, onboarding, profile name, engine settings and presets (with API key), repository settings, language consent, composer draft | localStorage | device preference | convenience only |
| Agent transcripts (`~/.claude/projects/…`) | outside Mori | external source data | the originals; never Mori's |
| `.mori` export | user-chosen file | user-managed export | sharing one session's domain data; not a backup |

Two premises found false while mapping: the V004 imports table and the V001 session snapshot are
never written by the app (corrected in the promotion doc §0.1), and the read flip never reached
the session repository on a normal launch, because the repository was created by the shell's
first render before `prepareDurableReads` decided (it captured "no durable storage" for the run).

## 3. Decisions

- **Imports are a durable-document class** (`session_import`, owner `<sessionId>.<importId>`, the
  suffix of the per-entry key), so the existing mirror, adoption, read flip and reset cover them.
  The V009 table is exactly this access pattern; no V014 was needed.
- **Reopen descriptors are one durable document per session** (`reopen_descriptor`, owner = the
  Mori session id), not one whole-map document and not a flipped key. The local map stays the
  device's capped recent-discovery cache; reads merge the two, newest activity winning per
  session (local on a tie). Upserts write only the entries they touch; a durable descriptor is
  deleted only by an explicit removal (prune) or a cap eviction of an unprotected session. So a
  launch that reads an empty or partial local map can never shrink SQLite's copies, which for a
  session whose original is gone are the only copy. (A whole-map document did exactly that, found
  in review.)
- **The read source is decided per call.** One storage (`lib/storage/appStorage`) forwards each
  read to the SQLite-backed cache once the flip engaged and to localStorage until then. Every
  durable reader goes through it; the default repository is also mirrored on desktop, so views
  that build their own repository write to SQLite like everything else.
- **Every launch, before the decision** (`prepareDurableReads`): replay deletes an earlier run
  recorded and SQLite never confirmed; run the adoption pass (copies every body localStorage
  holds newer than SQLite, or SQLite lacks; legacy import arrays entry by entry; never deletes
  from localStorage); merge and adopt reopen descriptors. This is what repairs a mirror write lost
  at a quit, and why the flip, which checks that SQLite holds every durable key localStorage
  holds, is not served stale bodies. Mirror-failure counts are diagnostics only; they do not
  steer the decision.
- **Deletes survive a quit.** The mirror records each delete in a device-local ledger until SQLite
  confirms it; a newer write of the same document supersedes it.
- **Protected descriptors.** The recency cap (1000) evicts only descriptors of sessions Mori keeps
  nothing of; a session with a kept archive, a saved passage or an import is exempt, from the
  first discovery pass on. Prune keeps those sessions and counts imports restored from SQLite.
- **Failure honesty.** An unreadable local descriptor map is set aside under a dated key and
  reported; durable copies keep serving. The read-through cache writes localStorage first, so a
  refused write never shows as saved. A full reset settles queued mirror writes before wiping
  SQLite and clears keys written straight to localStorage.

## 4. Recovery levels and the backup contract

| Level | Restored from the storage folder alone | Verified |
|---|---|---|
| A · records | records, contexts, revisions, passages | yes |
| B · evidence | archives and their source records, source links | yes |
| C · sessions | session list, imports, reopen descriptors: archived sessions open from the archive, imported sessions show their import | yes (isolated release runtime) |
| D · working context | reviewed membership (a `user` revision on the kernel record), project pages, search in an archive | yes (isolated release runtime, §5) |
| E · preferences | theme, layout, onboarding, engine settings, current session | **not included** by design |

**Backup:** quit Mori, then copy the whole storage folder (default `~/Mori/Records`, or the
location shown in 설정 › 저장소), including `mori.sqlite`, `mori.sqlite-wal`, `mori.sqlite-shm` and
`archives/`. A copy taken while Mori runs can miss writes still in the WAL. **Restore:** with Mori
closed, put the folder back at the storage location (or choose it with 변경 in settings), then
start Mori again; a folder chosen while Mori runs is only read in full on the next launch.
A restore onto a device that still holds Mori data is a merge, not a rollback: launch adoption
copies any locally held document that is newer than, or missing from, the restored database.
`backups/` (pre-migration snapshots) belongs to the folder too.
Preferences and engine settings (including any API key) are device-local and are re-entered.
An archive on the same disk as its original is not an independent backup; agent transcripts are
not part of Mori's backup.

## 5. Operator acceptance

1. In 설정 › 저장소, note the storage folder; quit Mori.
2. Copy the whole folder to another disk; keep a checksum list of its files.
3. On a separate OS user account or an isolated trial home (never over the live folder), put a copy
   of the backup at the storage location with no Mori app data present, and start Mori.
4. Check: the 프로젝트 page lists the same sessions; a kept session opens from 보관한 원본 and
   이 대화에서 찾기 works; a saved passage is found in 기록 and 원본 열기 says plainly when the
   original is gone; an imported session opens from its import.
5. Quit and confirm the backup on the other disk still matches its checksum list; the restored
   folder itself changes once Mori runs. Opening the backup itself with a SQLite tool rewrites
   `mori.sqlite-shm` (harmless, but it no longer matches), so inspect a copy instead.

Evidence for levels C and D (2026-10-10, synthetic profiles, release build of #221): after a
storage-only restore, a project page listed the same sessions; a session filed by hand into a
project other than its source folder stayed there and opened from its kept copy; search inside the
archive, passage search and an imported session worked; kernel and document rows were
content-identical before and after the restored launch.

## 6. Event identity and the references that hold meaning

Five stores hold session meaning, and they are not interchangeable:

| Store | Where (desktop) | Holds | Cites events by id |
|---|---|---|---|
| Session import | `durable_documents` `session_import` | the normalized turns of a transcript | is the target |
| Analysis and its run history | `analysis`, `analysis_history` | issues, decisions, next actions, the adopted run and earlier runs, with the user's review state | yes |
| Session memory body | `memory_body` | the adopted run's issues, decisions and next actions, projected | yes |
| Accepted project memory | SQLite `consolidated_memories` (never app storage) | reviewed cross-session memory | yes (`evidenceRefs`) |
| Record kernel | `kernel_records`, `kernel_objects` | records, contexts, sources, source links, revisions | no (passages use message locators) |

The legacy SQLite session snapshot (`sessions` and related tables) is read-only: nothing in the
current build writes one.

**How an event id is made.** `evt-<agent>-<session>-<turn index>-<turn time>`, where a turn is
dated by its reply. A storage-folder restore copies ids as they are; re-reading an unchanged
transcript yields the same ids.

**The one place an id changes.** Reopening a session whose last stored turn was a prompt still
waiting for its reply, once the reply is in: the turn's time, and so its id, changes. The adopted
analysis and the memory body follow the rename. Accepted project memory and analysis runs that are
not adopted cannot, so a turn they cite keeps its id and takes the reply's text and time; later
reads know it by its turn key (`connectorEventId`) and time. When accepted memory cannot be read
from SQLite, nothing is renamed.

**Failure found 2026-10-10.** The reopen guard read accepted memory from app storage, where
desktop never writes it, so on desktop a cited prompt was renamed and the memory's evidence
silently stopped resolving (the memory drawer drops a ref it cannot find). Reproduced in an
isolated release runtime and fixed; it did not depend on a restore. Also fixed: a launch with a
legacy snapshot replaced the current session's stored imports with the snapshot's older ones.

**Verified (isolated release runtime, synthetic profile):** a reviewed decision, a resolved issue,
a completed next action, accepted memory citing an answered prompt, a hand-filed project and a kept
copy survived reopen, a storage-only restore, a restart and a restore with the original gone; the
identity graph (ids, references and review states) was identical at every step with no dangling
reference.
