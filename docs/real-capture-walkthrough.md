# Real Capture Walkthrough

A practical walkthrough for capturing **your own** real Claude / Codex
/ Git work into Mori · end to end, from a finished CLI session to a
`.mori` package you can carry forward.

This is the real-data counterpart of
[`docs/e2e-smoke-flow.md`](e2e-smoke-flow.md), which uses a synthetic
fixture. Here the input is your actual work. Everything stays local:
Mori never scrapes a transcript, watches a folder, or reads an
account · you run an explicit capture command, and every captured
event passes through Import Review before it reaches a session.

The product loop this exercises:

```
Claude / Codex / CLI / Git work
  → explicit capture            (mori-local-capture / mori-capture / VS Code task)
  → Connector JSONL inbox       (~/.mori/connectors/)
  → Preview / Import Review     (Evidence Hub)
  → Timeline / Evidence Hub
  → Project Memory → Consolidation Review → Accepted Memory
  → Resume Prompt / Reports / .mori package
```

---

## Scenario

You just finished a Claude Code session refactoring a module, and you
made a couple of commits. You want that session in Mori so the
decisions survive into your next session.

## Step 1 · Capture, explicitly

Nothing in Mori watches your terminal. You capture when you choose to.

**Transcript.** Save your Claude / Codex conversation to a text file
yourself (copy it out of the CLI, or pipe it). Then:

```sh
# A saved transcript file:
python3 connectors/local-capture/mori-local-capture.py \
  --transcript ~/notes/claude-refactor-session.txt

# …or pipe a live session directly:
claude -p "summarise what we changed" \
  | python3 connectors/local-capture/mori-local-capture.py --transcript -
```

**Git work.** Capture safe metadata for the repo and the commits you
just made · no diff content, no file contents:

```sh
python3 connectors/local-capture/mori-local-capture.py \
  --git-repo . --git-commit HEAD
```

If you sourced the shell helper
([`connectors/terminal-helper/`](../connectors/terminal-helper/)) the
same captures are `mori-capture transcript ~/notes/…`,
`mori-capture git`, and `mori-capture commit`. From VS Code, the
[`connectors/vscode-task/`](../connectors/vscode-task/) tasks do the
same on an explicit **Run Task**.

Each command appends one JSONL line per event to
`~/.mori/connectors/local-capture/<date>.jsonl` and prints the path.
Captured events are **summary-only** · the full transcript text and
diff content are never stored.

## Step 2 · Load the connector JSONL

Open Mori → **Evidence Hub** → **Connector JSONL**.

- Desktop: click **Refresh inbox** and pick the file from
  `~/.mori/connectors/local-capture/`.
- Browser: open the JSONL file and paste its contents.

Parse / Preview runs automatically. The preview card classifies the
import (`new` / `partialReimport` / `duplicateOnly` …) and shows a
source-level summary, so a second capture of the same session is
detected as a duplicate rather than re-added.

## Step 3 · Import Review

Click **Import to Review**. The normalized events land in **Import
Review** · the non-bypassable gate. Nothing reaches the Timeline
until you accept it here. Review each event; discard anything you
did not mean to capture.

## Step 4 · Timeline / Evidence Hub

Accepted events become Timeline entries · the transcript as an
`aiConversation`, the Git captures as `fileCode` events · each
carrying a connector identity and a typed evidence reference back to
its source. The Evidence Hub shows the imported source with its
trust level and `summary-only` raw-data policy.

## Step 5 · Project Memory → Consolidation Review

Run **Quick Pass** to derive issues / decisions, then open **Project
Memory**. The Consolidation Preview proposes durable memory from the
session. Open **Consolidation Review**: accept, edit, or discard each
proposal. Only accepted proposals become **Accepted Memory**, and
every decision is recorded in the Memory Audit Trail.

## Step 6 · Resume Prompt / Reports / `.mori` package

From accepted memory you can:

- generate a **Resume Prompt** to start your next Claude / Codex
  session with the durable context;
- build a **Markdown report**;
- export a **`.mori` package** (a real zip) · the normal export, or a
  **client-safe export** for handing to a non-teammate (see
  [`docs/team-shared-memory.md`](team-shared-memory.md)).

The exported package carries your accepted memory and its audit
trail, and re-imports through the same Consolidation Review path on
any device.

## What stays out of scope

- No background capture · every event in this walkthrough exists
  because you ran an explicit command.
- No raw content · transcripts and diffs are captured as summaries.
- No auto-import · Import Review is always the gate.
- No cloud sync · `.mori` packages move only when you move the file.

## See also

- [`docs/connectors/local-capture.md`](connectors/local-capture.md) ·
  the capture bridge reference.
- [`docs/e2e-smoke-flow.md`](e2e-smoke-flow.md) · the same loop with a
  synthetic fixture.
- [`docs/mori-package-v0.md`](mori-package-v0.md) · the `.mori`
  package format.
