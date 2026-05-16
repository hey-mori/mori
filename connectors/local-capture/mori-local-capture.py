#!/usr/bin/env python3
"""Mori local connector capture bridge.

Turns explicit local inputs into Mori Connector JSONL events:

  --transcript <path>   Read a transcript text file the user explicitly
                        provides, or `-` to read from stdin so a piped
                        Claude / Codex CLI session can be captured:
                        `claude ... | mori-local-capture --transcript -`.
                        Records a summary only; the full text is never
                        stored in the event.
  --note <text>         Record a manual note the user types on the command
                        line.
  --git-repo <path>     Capture *safe* Git snapshot metadata for a repo the
                        user explicitly points at: branch, HEAD SHA, dirty
                        state, changed file paths, and an additions/deletions
                        diff stat. No diff content, no file contents.

The script appends JSONL events to a local connector inbox file (default
~/.mori/connectors/local-capture/<date>.jsonl). It does NOT import anything
into Mori — the user opens Evidence Hub -> Connector JSONL and walks the
events through Import Review explicitly.

Local-first by construction:
  - No network calls.
  - No background watcher, no daemon, no scheduled job.
  - No account scraping, no app-database scraping, no browser scraping.
  - No clipboard capture.
  - Reads only the explicit path / text the user passes on the command line.

Requires Python 3.8+ and (for --git-repo) the `git` executable on PATH.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

TOOL_NAME = "mori-local-capture.py"
TOOL_VERSION = "0.1.0"
DEFAULT_OUT_DIR = "~/.mori/connectors/local-capture"
MAX_GIT_FILES = 100
NOTE_SUMMARY_LIMIT = 240
TRANSCRIPT_FIRST_LINE_LIMIT = 160


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_from_timestamp(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def compact_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def single_line(text: str) -> str:
    """Collapse all whitespace runs to a single space."""
    return " ".join(text.split())


def truncate(text: str, limit: int) -> str:
    text = single_line(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def privacy(note: str) -> dict:
    return {
        "captureMethod": "local_cli_wrapper",
        "rawDataPolicy": "summary_only",
        "redacted": False,
        "note": note,
    }


def provenance() -> dict:
    # Host / machine name is intentionally omitted — it is not needed and
    # would be one more local detail to leak into a durable artefact.
    return {"toolName": TOOL_NAME, "toolVersion": TOOL_VERSION}


def base_event(event_id: str, connector_id: str, kind: str, session_id: str,
               occurred_at: str, received_at: str) -> dict:
    return {
        "id": event_id,
        "connectorId": connector_id,
        "kind": kind,
        "occurredAt": occurred_at,
        "receivedAt": received_at,
        "sessionId": session_id,
    }


# --------------------------------------------------------------------------
# --transcript
# --------------------------------------------------------------------------

def capture_transcript(path: str, session_id: str, received_at: str,
                       connector_id: str) -> dict:
    # `-` reads the transcript from stdin so a piped CLI session can be
    # captured. Any other value is an explicit file path.
    if path == "-":
        text = sys.stdin.read()
        if not text.strip():
            raise CaptureError("--transcript: stdin was empty")
        name = "stdin"
        occurred_at = received_at
    else:
        p = Path(os.path.expanduser(path))
        if not p.is_file():
            raise CaptureError(f"--transcript: not a file: {path}")
        text = p.read_text(encoding="utf-8", errors="replace")
        name = p.name
        occurred_at = iso_from_timestamp(p.stat().st_mtime)

    lines = text.splitlines()
    non_empty = [line.strip() for line in lines if line.strip()]
    first = non_empty[0] if non_empty else ""

    summary = f"Imported transcript {name} ({len(lines)} lines)."
    if first:
        summary += f" First line: {truncate(first, TRANSCRIPT_FIRST_LINE_LIMIT)}"

    event = base_event(
        event_id=f"{session_id}-transcript",
        connector_id=connector_id,
        kind="transcript_imported",
        session_id=session_id,
        occurred_at=occurred_at,
        received_at=received_at,
    )
    source_note = (
        "Transcript piped from stdin by the user"
        if path == "-"
        else "Transcript file read explicitly by the user"
    )
    event["sourceTitle"] = f"Transcript: {name}"
    event["summary"] = summary
    event["privacy"] = privacy(
        f"Local capture CLI. {source_note}; full text is not stored — "
        "summary metadata only."
    )
    event["provenance"] = provenance()
    return event


# --------------------------------------------------------------------------
# --note
# --------------------------------------------------------------------------

def capture_note(text: str, session_id: str, occurred_at: str, received_at: str) -> dict:
    cleaned = single_line(text)
    if not cleaned:
        raise CaptureError("--note: note text is empty")

    event = base_event(
        event_id=f"{session_id}-note",
        connector_id="manual",
        # `session_finished` is the connector event kind Mori maps to a
        # `documentNote` timeline entry — see README event-mapping table.
        kind="session_finished",
        session_id=session_id,
        occurred_at=occurred_at,
        received_at=received_at,
    )
    event["sourceTitle"] = "Manual note"
    event["summary"] = truncate(cleaned, NOTE_SUMMARY_LIMIT)
    event["privacy"] = privacy(
        "Local capture CLI. Manual note recorded explicitly by the user."
    )
    event["provenance"] = provenance()
    return event


# --------------------------------------------------------------------------
# --git-repo
# --------------------------------------------------------------------------

def run_git(repo: str, args: list) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True,
        text=True,
        check=False,
    )


def classify_change(code: str) -> str:
    if "?" in code:
        return "added"
    if "D" in code:
        return "deleted"
    if "R" in code:
        return "renamed"
    if "A" in code:
        return "added"
    return "modified"


def parse_porcelain(status_text: str) -> list:
    files = []
    for raw in status_text.splitlines():
        if not raw.strip():
            continue
        # Porcelain v1: two status chars, a space, then the path.
        code = raw[:2]
        rest = raw[3:] if len(raw) > 3 else raw[2:].lstrip()
        change_type = classify_change(code)
        entry = {"path": rest, "changeType": change_type}
        if change_type == "renamed" and " -> " in rest:
            old, new = rest.split(" -> ", 1)
            entry["path"] = new
            entry["renameFrom"] = old
        files.append(entry)
    return files


def capture_git(path: str, session_id: str, occurred_at: str, received_at: str) -> dict:
    repo = os.path.abspath(os.path.expanduser(path))
    if not os.path.isdir(repo):
        raise CaptureError(f"--git-repo: not a directory: {path}")

    inside = run_git(repo, ["rev-parse", "--is-inside-work-tree"])
    if inside.returncode != 0 or inside.stdout.strip() != "true":
        raise CaptureError(f"--git-repo: not a Git work tree: {path}")

    toplevel = run_git(repo, ["rev-parse", "--show-toplevel"]).stdout.strip()
    repo_name = os.path.basename(toplevel) or "repository"

    head = run_git(repo, ["rev-parse", "HEAD"])
    head_commit = head.stdout.strip() if head.returncode == 0 else None
    short_head = head_commit[:7] if head_commit else None

    branch = run_git(repo, ["branch", "--show-current"]).stdout.strip() or None

    status_text = run_git(repo, ["status", "--porcelain"]).stdout
    files = parse_porcelain(status_text)
    is_dirty = bool(files)

    truncated_files = False
    if len(files) > MAX_GIT_FILES:
        files = files[:MAX_GIT_FILES]
        truncated_files = True

    additions = 0
    deletions = 0
    numstat = {}
    if head_commit:
        ns = run_git(repo, ["diff", "HEAD", "--numstat"]).stdout
        for line in ns.splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            add_raw, del_raw, file_path = parts
            add = int(add_raw) if add_raw.isdigit() else 0
            dele = int(del_raw) if del_raw.isdigit() else 0
            numstat[file_path] = (add, dele)
            additions += add
            deletions += dele

    for entry in files:
        counts = numstat.get(entry["path"])
        if counts is not None:
            entry["additions"], entry["deletions"] = counts

    git_meta = {}
    if branch:
        git_meta["branch"] = branch
    if head_commit:
        git_meta["headCommit"] = head_commit
        git_meta["shortHeadCommit"] = short_head
    git_meta["isDirty"] = is_dirty
    git_meta["additions"] = additions
    git_meta["deletions"] = deletions
    git_meta["files"] = files

    state = "dirty" if is_dirty else "clean"
    head_label = short_head or "no-commit"
    branch_label = branch or "detached HEAD"
    file_label = f"{len(files)} file{'s' if len(files) != 1 else ''} changed"
    if truncated_files:
        file_label += f" (first {MAX_GIT_FILES} listed)"
    summary = (
        f"Git snapshot · branch {branch_label} · HEAD {head_label} "
        f"· {state} · {file_label} (+{additions} / -{deletions})"
    )

    event = base_event(
        event_id=f"{session_id}-git",
        connector_id="gitCommand",
        kind="git_diff_captured",
        session_id=session_id,
        occurred_at=occurred_at,
        received_at=received_at,
    )
    event["sourceTitle"] = f"Git snapshot: {repo_name}"
    event["summary"] = summary
    event["git"] = git_meta
    event["privacy"] = privacy(
        "Local capture CLI. Git metadata only — no diff content, no file "
        "contents, no absolute repository path."
    )
    event["provenance"] = provenance()
    return event


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

class CaptureError(Exception):
    pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mori-local-capture",
        description=(
            "Generate Mori Connector JSONL from explicit local inputs. "
            "Local-first: no network, no watchers, no scraping, no auto-import."
        ),
    )
    parser.add_argument("--transcript", metavar="PATH",
                        help="read an explicitly provided transcript text file, "
                             "or `-` to read from stdin")
    parser.add_argument("--connector", metavar="ID", default="desktopTranscriptImport",
                        help="connector id for the transcript event "
                             "(default: desktopTranscriptImport)")
    parser.add_argument("--note", metavar="TEXT",
                        help="record a manual note")
    parser.add_argument("--git-repo", metavar="PATH", dest="git_repo",
                        help="capture safe Git snapshot metadata for a repo")
    parser.add_argument("--out", metavar="DIR", default=DEFAULT_OUT_DIR,
                        help=f"output directory (default {DEFAULT_OUT_DIR})")
    parser.add_argument("--session", metavar="ID",
                        help="group all events under this session id "
                             "(default: a fresh local-<timestamp> id)")
    return parser


def main(argv: list) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not (args.transcript or args.note or args.git_repo):
        parser.print_help(sys.stderr)
        print("\nmori-local-capture: provide at least one of "
              "--transcript / --note / --git-repo", file=sys.stderr)
        return 64

    session_id = args.session or f"local-{compact_now()}"
    received_at = iso_now()
    occurred_at = received_at

    events = []
    errors = []

    if args.transcript:
        try:
            events.append(capture_transcript(
                args.transcript, session_id, received_at, args.connector))
        except CaptureError as exc:
            errors.append(str(exc))

    if args.note:
        try:
            events.append(capture_note(args.note, session_id, occurred_at, received_at))
        except CaptureError as exc:
            errors.append(str(exc))

    if args.git_repo:
        try:
            events.append(capture_git(args.git_repo, session_id, occurred_at, received_at))
        except CaptureError as exc:
            errors.append(str(exc))

    for message in errors:
        print(f"mori-local-capture: {message}", file=sys.stderr)

    if not events:
        return 1 if errors else 64

    out_dir = Path(os.path.expanduser(args.out))
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl"
    with out_file.open("a", encoding="utf-8") as handle:
        for event in events:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    print(f"mori-local-capture: wrote {len(events)} event(s) to {out_file}")
    print("Open Mori -> Evidence Hub -> Connector JSONL, load the file, "
          "and review the events in Import Review before they reach a session.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
