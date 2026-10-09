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

## 2. Ownership map (desktop, verified against main e93b44fe)

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

- **Descriptors and imports are durable-document classes**, not a new table: `auto_import_descriptors`
  (app-scoped, the whole map) and `session_import` (owner `<sessionId>.<importId>`, the suffix of
  the per-entry key). The V009 table is exactly the access pattern (whole document per owner,
  list by kind), its rule for breaking a kind out ("found by something other than its owner")
  does not apply, and reusing it brings the existing mirror, adoption, flip and reset coverage
  with no schema change and so no new migration boundary. No V014 was needed.
- **The read source is decided per call.** One storage (`lib/storage/appStorage`) forwards each
  read to the SQLite-backed cache once the flip engaged and to localStorage until then. Every
  durable reader goes through it: the session repository, views that build their own repository,
  the descriptor store, the project mappings, the import-presence checks.
- **Adoption runs before the decision.** The adoption marker moved to v2; a device that adopted
  the earlier classes copies the two new ones once (skipping anything SQLite holds at least as
  new), converting legacy import arrays entry by entry. It runs inside `prepareDurableReads`, so
  an upgrade launch does not hold the flip back. Nothing is deleted from localStorage.
- **Reconciliation** is the flip's existing rule: SQLite is served only when it holds every
  durable key localStorage holds; otherwise reads stay on localStorage and the gap is reported.
  On a fresh restore localStorage is empty, so SQLite is served. Writes go to both.
- **Protected descriptors.** The recency cap (1000) evicts only descriptors of sessions Mori
  keeps nothing of; a session with a kept archive, a saved passage or an import is exempt. Prune
  already keeps those sessions; it now counts imports restored from SQLite.
- **Failure honesty.** A stored descriptor map that cannot be parsed is never replaced by a
  map holding only new entries; mirror failures are counted and hold the flip back.

## 4. Recovery levels and the backup contract

| Level | Restored from the storage folder alone | Verified |
|---|---|---|
| A · records | records, contexts, revisions, passages | yes |
| B · evidence | archives and their source records, source links | yes |
| C · sessions | session list, imports, reopen descriptors: archived sessions open from the archive, imported sessions show their import | yes (isolated release runtime) |
| D · working context | reviewed membership, project pages, search | see the acceptance record |
| E · preferences | theme, layout, onboarding, engine settings, current session | **not included** by design |

**Backup:** quit Mori, then copy the whole storage folder (default `~/Mori/Records`, or the
location shown in 설정 › 저장소), including `mori.sqlite`, `mori.sqlite-wal`, `mori.sqlite-shm` and
`archives/`. A copy taken while Mori runs can miss writes still in the WAL. **Restore:** with Mori
closed, put the folder back at the storage location (or choose it in settings), then start Mori.
Preferences and engine settings (including any API key) are device-local and are re-entered.
An archive on the same disk as its original is not an independent backup; agent transcripts are
not part of Mori's backup.
