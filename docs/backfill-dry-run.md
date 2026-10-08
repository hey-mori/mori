# Offline backfill dry run

A read-only check of what the provisional-session backfill (#147) **would**
change, run against a snapshot of a real `mori.sqlite` without launching Mori.
It reports counts only. It never applies anything. Applying is a separate,
owner-approved step that this tool does not perform. Issue #148.

## Why offline

- **Launching any Mori build applies pending migrations at startup.** See
  `initialize_sqlite_database` and `ensure_migrated` in
  `src-tauri/src/sqlite.rs`. A dry run inside the app would write schema
  changes to an older database before reading anything.
- **A running Mori keeps writing.** Auto-import writes to the kernel on its own,
  so a before/after comparison would prove nothing.

## What it runs

- **Production code:** `src/tools/backfill-dry-run/` runs the production
  planner (`planAgentSessionStatusBackfill`) through the production
  `KernelRepository` in desktop mode and the production SQLite row converters.
- **The only SQL it adds** is the read side of `src-tauri/src/db/kernel.rs`.
- **Order of steps:**
  1. Refuse a path inside Mori's live storage directory. The directory is
     resolved like `default_storage_dir()`: `~/.mori/storage_location` if set,
     else `<HOME or USERPROFILE>/Mori/Records`.
  2. Refuse a snapshot with a non-empty `-wal` beside it.
  3. Copy the snapshot into a private temp directory. Open the copy read-only.
     The snapshot itself is never opened. Opening a WAL database read-only can
     still create `-wal` / `-shm` files, and they land in that temp directory.
  4. Require `PRAGMA integrity_check` = `ok`.
  5. Check `_mori_migrations`: contiguous from 001, at least V008 (the
     kernel), and nothing this build does not know (V001–V013 today). Check the
     kernel tables and columns the planner reads.
  6. Plan twice and require identical results.
  7. Fail on any write attempt or any SQLite read failure. Offline there is no
     legitimate fallback.
  8. Confirm the snapshot's bytes did not change and no file appeared beside it.

Anything unknown fails closed with an error code. The tool never returns a
partial or zero result in place of an error.

**Output** is one JSON object: tool version and source commit, applied
migrations, planner counts (`scanned`, `eligible`, skipped by reason),
repeatability, integrity, SQL context counts (labelled as such, not planner
output), and the snapshot's size and SHA-256. It never contains titles,
bodies, record ids, or paths.

## Build the tool

You need **Node 22.13 or newer**, for `node:sqlite` with `readOnly`.

1. Check out a reviewed Mori commit.
2. Install dependencies: `npm ci`
3. Build: `npm run build:backfill-dry-run`

This writes `tools-dist/mori-backfill-dry-run.mjs`, a single file that depends
only on Node built-ins. It is a build artifact and is not committed. Its first
line names the commit it was built from, and says if the working tree was
dirty.

## Take a consistent snapshot (Windows, PowerShell)

1. **Quit Mori from the app.** On a clean close SQLite checkpoints the WAL into
   `mori.sqlite`. Then confirm nothing named Mori is still running. This
   should print nothing:

   ```powershell
   Get-Process | Where-Object { $_.ProcessName -like "*mori*" }
   ```

2. **Find the storage directory.** The same rule as the app: `HOME` if set,
   else `USERPROFILE`, then the override file. Settings › 저장 in the app shows
   the same path.

   ```powershell
   $home_ = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
   $override = Join-Path $home_ ".mori\storage_location"
   $dir = if ((Test-Path $override) -and (Get-Content $override -Raw).Trim()) { (Get-Content $override -Raw).Trim() } else { Join-Path $home_ "Mori\Records" }
   $dir
   ```

3. **Record the original state** in a local note. Keep this note local; do not
   share it.

   ```powershell
   Get-ChildItem (Join-Path $dir "mori.sqlite*") | Select-Object Name, Length, LastWriteTime
   Get-FileHash (Join-Path $dir "mori.sqlite*") -Algorithm SHA256
   ```

   If `mori.sqlite-wal` is present and **non-empty** after a clean quit,
   **stop**. Do not merge files by hand. Report it before going further.

4. **Make the archive backup.** Copy every `mori.sqlite*` file together, while
   Mori is closed:

   ```powershell
   $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
   $backup = Join-Path $home_ "mori-backup-$stamp"
   New-Item -ItemType Directory $backup | Out-Null
   Copy-Item (Join-Path $dir "mori.sqlite*") $backup
   Get-FileHash (Join-Path $backup "mori.sqlite*") -Algorithm SHA256
   ```

   The hashes must match step 3.

5. **Make the analysis snapshot.** This is a separate copy, never the archive
   backup:

   ```powershell
   $work = Join-Path $home_ "mori-dryrun-$stamp"
   New-Item -ItemType Directory $work | Out-Null
   Copy-Item (Join-Path $dir "mori.sqlite") (Join-Path $work "mori-snapshot.sqlite")
   ```

## Run

```powershell
node tools-dist\mori-backfill-dry-run.mjs --snapshot (Join-Path $work "mori-snapshot.sqlite") > dryrun.json
$LASTEXITCODE
```

**Exit codes:**

- `0` prints the report.
- `1` prints `{ "error": { "code", "message" } }`. That is a refusal, not a
  result.
- `2` means bad usage.

Node may print an `ExperimentalWarning` for `node:sqlite` on stderr. Stdout
stays JSON.

**What to bring back:** `dryrun.json`. It holds counts only. Keep the local
note from step 3 to yourself.

## What a result does and does not prove

- **It proves:** what the production planner would select on that snapshot,
  read-only and repeatably.
- **It does not prove:** what an apply would do to the live database later,
  anything about records written after the snapshot, or whether promoting them
  makes the continuation pack useful.
