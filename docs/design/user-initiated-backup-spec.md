# 백업 Q2 · user-initiated database backup (spec)

Status: **proposal spec, 2026-07-15.** Implementation contract for
slice Q2 of
[`kernel-integrity-and-extensibility-review.md`](kernel-integrity-and-extensibility-review.md):
give the canonical store a user-initiated backup before `.mori` v1
(K4) delivers real portability. Desktop-only; browser mode is covered
by the honesty labels, not by this slice.

Grounded in shipped code: `src-tauri/src/db/backup.rs`
(`backup_database` via `VACUUM INTO` + millisecond-stamped filenames,
`list_backups_in`, `restore_backup`, prune to `MAX_BACKUPS = 5`),
commands `list_sqlite_backups` / `restore_sqlite_backup`, and the
migration-error-only `DatabaseRecoveryCard`
(`src/features/settings/DatabaseRecoveryCard.tsx`).

## 1. The gap this closes

Snapshots exist but are written only when a migration is pending, live
on the same disk beside the live DB, and surface only in the
migration-error state. A user cannot say "back up my data now" and
cannot get a copy off this disk. Q2 adds both, reusing the existing
engine; it deliberately does **not** invent a new format (that is
`.mori` v1's job).

## 2. Two actions, different guarantees

| Action | Destination | Protects against | Mechanism |
| --- | --- | --- | --- |
| 지금 백업 만들기 | managed `backups/` dir | bad migration, app bug, accidental data damage | existing `backup_database(conn, dir, "manual")` |
| 백업 파일로 내보내기 | user-chosen path (Save As) | disk loss, machine move | same `VACUUM INTO` to the picked path (new command), following the `save_mori_package_zip_as` dialog pattern |

Both are whole-DB snapshots (kernel + legacy tables together), stated
plainly in the card copy: "전체 데이터베이스 사본입니다". The export
copy adds where it can be used: "새 기기에서 복원할 수 있습니다"
(restore path below).

## 3. Surface

One quiet card in 설정 > 저장 (beside the storage-location control,
NOT inside the error-state recovery card):

- Primary line: 마지막 백업 시각 (from `list_sqlite_backups`, or
  "백업 없음"), honest about kind (자동/수동 are the same pool, see
  §4).
- Two actions per §2. Success shows the created file's name; the
  managed backup offers 폴더 열기 via the existing
  `reveal_path_in_os`.
- Failure states: disk full (surface the Rust error verbatim, it is
  already actionable), DB busy (retry guidance).
- **Restore stays where it is.** `DatabaseRecoveryCard` remains the
  restore surface, but gains one entry condition besides
  migration-error: a 복원… disclosure on this card routes to the same
  confirm-gated flow for restoring a picked backup file (including an
  exported one). Restoring is destructive-by-replacement, so it keeps
  the existing pre-restore safety snapshot behavior in
  `restore_backup`.

## 4. Pool semantics (explicit, because prune bites)

Manual backups share the managed pool and its prune-to-5: five manual
clicks can evict an older migration snapshot. That is acceptable for
Q2 (the pool exists for recency, not history) but must be stated in
the card's InfoHint rather than discovered. The Save As export is
outside the pool and never pruned. If real usage shows the pool
fighting itself, per-label caps are a one-line change in
`prune_backups`; do not build that speculatively.

## 5. Non-goals

Scheduled/automatic periodic backups (a background job Mori does not
need yet), cloud destinations, partial/selective export (that is
`.mori` v1 §11 scope), browser-mode export (localStorage kernel data
is covered by Q3 migration and K4, not by DB snapshots), backup
encryption (the source DB is not encrypted; a snapshot pretending
otherwise would be theater).

## 6. Done criteria and tests

1. From 설정 > 저장: one click produces a managed backup, the card's
   last-backup line updates, 폴더 열기 reveals it.
2. Save As produces a working snapshot at the chosen path; restoring
   it through the recovery flow on a wiped dev DB brings records back
   (round-trip test against a temp DB in Rust).
3. Prune behavior covered: 6 manual backups leave 5 files.
4. Restore keeps its confirm gate and pre-restore safety snapshot.
5. Card renders honestly with zero backups and in browser mode
   (desktop-only notice, action disabled).
