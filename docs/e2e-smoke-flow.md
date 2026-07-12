# End-to-End Smoke Flow

A practical walkthrough you can run locally to verify the Mori product
loop is wired up. Everything here is local-only. Mori does **not**
sync to a cloud, watch folders in the background, or read external
accounts — see "Step 9 / What is still not implemented" at the bottom.

Use the sample fixture at
[`docs/fixtures/connector-sample-mori-session.jsonl`](fixtures/connector-sample-mori-session.jsonl)
as the canonical demo input. It is synthetic — no real paths, no real
accounts, no secrets.

---

## Step 0 — Run Mori locally

Browser-only (no Tauri shell needed):

```bash
npm install   # only the first time, or after pulling new deps
npm run dev
```

Open the URL the dev server prints (usually <http://localhost:5173>).

Optional desktop / Tauri shell (only if you have the Rust toolchain
installed and the project's `src-tauri/` prerequisites are met):

```bash
npm run tauri:dev
```

For the smoke flow below, the browser dev server is enough.

---

## Step 1 — Open Evidence Hub → Connector JSONL

Open the active session's workspace and go to its evidence surface
(자료 / Add Source; Evidence is no longer a standing left-nav tab).
Inside the Evidence Hub, choose the **Connector JSONL** tab (the tab
that takes pasted connector events instead of an AI transcript or git
diff).

---

## Step 2 — Paste the sample JSONL

1. Open `docs/fixtures/connector-sample-mori-session.jsonl` in your
   editor.
2. Copy the entire file contents (comments included — Mori's parser
   skips `#` comment lines automatically).
3. Paste into the **Connector JSONL** textarea.

**Why this fixture is safe**: it uses synthetic paths
(`src/features/.../ImportReviewView.tsx`), no real account names, no
secrets, and no real connector tool versions. Every event uses the
existing `claudeCodeHook` / `gitCommand` connector ids the parser
already recognises.

---

## Step 3 — Parse / Preview

Click **Parse / Preview** (or whatever the panel's primary action is).

Expected result:

- **Valid event count** ≥ 12 (the fixture has 13 events).
- **Source-level import summary** appears with status **new** (or
  **historyUnavailable** if browser session history isn't available
  yet — that's an honesty downgrade, not an error).
- Privacy / honesty notes appear; no cloud / OAuth language.
- **Duplicate counts are zero** on the first import.

If the preview shows validation errors instead, your paste is missing
required fields — make sure you copied the whole file.

---

## Step 4 — Import to Review

Click **Import to Review**.

Expected result:

- The **Import Review** page opens.
- Candidate events are visible, one card per event, with kind /
  timestamp / summary.
- The **meta strip** at the top shows the source import summary
  ("new · N events" or similar).
- The **Apply to Timeline** button is enabled with `N` accepted.

You can Accept / Discard individual events here. For the smoke flow,
leave everything as Accept.

---

## Step 5 — Apply to session

Click **Apply to Timeline**.

Expected result:

- A green success banner appears:
  > **N개 이벤트를 세션에 적용했습니다.** 출처: *<source title>* · 중복 0개는 자동으로 건너뜀

  followed by four next-step buttons:
  - **Timeline 열기** → routes to the Timeline view.
  - **Evidence Hub 열기** → routes to Evidence.
  - **Project Memory 열기** → routes to Memory.
  - **Quick Pass 실행 (Reports)** → routes to Reports (only shown
    when there is no analysis yet).
- The footer note clarifies that decisions / issues / next-actions
  are populated after Quick Pass — they don't appear in Project Memory
  yet.

Click **Timeline 열기**. The imported events should be visible on the
timeline, each tagged with its connector kind.

Click **Evidence Hub 열기**. The imported source row should appear
with its provenance metadata. Opening the source detail panel shows
the connector ids, capture method, and re-import status.

---

## Step 6 — Run Quick Pass (optional, but recommended)

Go to **Reports**. Run Quick Pass.

Expected result:

- Quick Pass produces issues / decisions / next-actions from the
  imported events.
- The active session view gets richer.
- A `StoredSessionMemoryBody` snapshot is persisted to browser
  localStorage so the Memory page can include this session's
  decisions / issues in the cross-session aggregation on the next
  reload.

Without Quick Pass, the Memory page will still show imports and key
evidence — but decisions / issues / next-actions stay empty for this
session and a warning explains why.

---

## Step 7 — Open Project Memory

Open the project's page (프로젝트 nav); durable project memory lives
there, or reach the memory overview via the command palette (메모리 is
no longer a standing left-nav tab).

Expected result:

- The **data-basis badge** at the top reflects what's actually
  aggregated (e.g. `Active session only` for a single fresh session,
  `Active + saved sessions` after multiple Mori runs).
- A **warnings strip** documents what is *not* aggregated (e.g.
  metadata-only saved sessions, old imports without identity).
- The **Recent sessions** card shows the current session with a
  green "본문 로드됨" load-status badge.
- The **Re-import history** card shows the import you just applied if
  the summary was persisted.
- The **right summary panel** generates a Resume prompt:
  - Use the **대상** dropdown to switch between `self`, `claude`,
    `codex`, `chatgpt`, `handoff`.
  - Use the **공개 범위** dropdown to switch between `normal`,
    `summaryOnly`, and `clientSafe`.
  - The honesty note below the buttons confirms the prompt is
    generated locally from Mori sessions.
- **Copy** copies the prompt to clipboard. Paste it into Claude or
  Codex to start a follow-up session.

---

## Step 8 — Re-import the same JSONL

Go back to **Evidence Hub → Connector JSONL** and paste the same
fixture again.

Expected result:

- The preview's **source import summary** flips to **partial
  re-import** or **duplicate-only**:
  - 12 events match the previously-imported identities and are
    classified as duplicates (`currentSessionDuplicateCount`).
  - 1 event (`session_started`) does not produce a TimelineEvent, so
    it has no counterpart and shows up as "new". This is honest
    accounting — the source includes one row Mori hasn't stored as a
    TimelineEvent.
- Duplicates are **skipped by default**. Toggling **Include
  duplicates** in the preview before opening Import Review re-includes
  them.
- Opening Import Review without including duplicates results in zero
  candidate events ready to apply, with a clear note explaining why.

This is how you verify connector identity + cross-session duplicate
detection are wired correctly.

---

## Step 9 — What is still not implemented

This walkthrough makes the **existing** product loop visible. The
following are deliberately deferred or out of scope:

- **No live Claude / Codex sync.** Connector events arrive only when
  the user explicitly pastes them or loads them from
  `~/.mori/connectors/` via the desktop inbox.
- **No background folder watching.** Mori does not monitor
  filesystems, terminals, or any other capture surface in the
  background.
- **No OAuth, no cloud sync.** Mori does not connect to external
  accounts.
- **No external app / account reading.** Mori only reads files the
  user has explicitly pasted or selected via the desktop inbox.
- **Session Canvas / Workroom.** A future visual surface is documented
  in [`docs/roadmap.md`](roadmap.md) but no UI is shipped for it.
- **SQLite-side `importSummary` mirror.** Desktop SQLite sessions do
  not contribute to the connector re-import rollup yet — the Memory
  page surfaces this as a warning.

---

## What to check when the flow breaks

If something on this walkthrough doesn't match reality, treat it as a
docs-and-product mismatch:

1. Re-run the canonical fixture test:
   ```bash
   npx vitest run src/lib/connectors/connectorSampleFixture.test.ts
   ```
   This validates parse → preview → normalize → duplicate-detection
   for the same fixture this walkthrough uses.

2. Re-run the full validation gate:
   ```bash
   npm run check:full
   ```

3. If the test passes but the UI doesn't match, the breakage is in
   the UI wiring. Search for the relevant screen
   (`ImportPanel.tsx` / `ImportReviewView.tsx` / `MemoryView.tsx`)
   and fix the wiring — do not silently update this doc.

The doc and the fixture are intentionally exact so a regression in
either one shows up immediately.
