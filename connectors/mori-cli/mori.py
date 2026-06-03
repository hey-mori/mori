#!/usr/bin/env python3
"""Mori CLI wrapper.

Small command-line front door for explicit local capture. This CLI does not
invent a new schema: it delegates to `connectors/local-capture/mori-local-capture.py`,
so every event still enters Mori as Connector JSONL and goes through Import
Review.

Initial scope:

  mori capture note "..."
  mori capture transcript <path-or-stdin>
  mori capture git [--repo PATH]
  mori capture commit [REF] [--repo PATH]

No daemon, no watcher, no shell history, no agent subprocess wrapping yet.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def default_local_capture() -> Path:
    env = os.environ.get("MORI_LOCAL_CAPTURE")
    if env:
        return Path(os.path.expanduser(env))
    return Path(__file__).resolve().parents[1] / "local-capture" / "mori-local-capture.py"


def add_common_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--out", metavar="DIR", help="output directory for Connector JSONL")
    parser.add_argument("--session", metavar="ID", help="external connector session id")
    parser.add_argument(
        "--local-capture",
        metavar="PATH",
        help="override path to mori-local-capture.py (default: sibling template)",
    )


def append_common(args: argparse.Namespace, command: list[str]) -> None:
    if args.out:
        command.extend(["--out", args.out])
    if args.session:
        command.extend(["--session", args.session])


def build_local_capture_command(args: argparse.Namespace) -> list[str]:
    script = Path(os.path.expanduser(args.local_capture)) if args.local_capture else default_local_capture()
    if not script.is_file():
        raise SystemExit(f"mori: local capture script not found: {script}")

    command = [sys.executable, str(script)]
    action = args.capture_action
    if action == "note":
        command.extend(["--note", " ".join(args.text).strip()])
    elif action == "transcript":
        command.extend(["--transcript", args.path])
        if args.connector:
            command.extend(["--connector", args.connector])
    elif action == "git":
        command.extend(["--git-repo", args.repo])
    elif action == "commit":
        command.extend(["--git-commit", args.ref])
    else:
        raise SystemExit(f"mori: unknown capture action: {action}")

    append_common(args, command)
    return command


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mori",
        description="Explicit local capture into Mori Connector JSONL.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    capture = subcommands.add_parser(
        "capture",
        help="write explicit local inputs as Connector JSONL",
    )
    capture_actions = capture.add_subparsers(dest="capture_action", required=True)

    note = capture_actions.add_parser("note", help="capture a manual note")
    note.add_argument("text", nargs="+", help="note text")
    add_common_flags(note)

    transcript = capture_actions.add_parser("transcript", help="capture a transcript file or - for stdin")
    transcript.add_argument("path", help="transcript path, or - for stdin")
    transcript.add_argument(
        "--connector",
        metavar="ID",
        help="connector id for transcript event (default: desktopTranscriptImport)",
    )
    add_common_flags(transcript)

    git = capture_actions.add_parser("git", help="capture safe Git snapshot metadata")
    git.add_argument("--repo", default=".", help="repository path (default: current directory)")
    add_common_flags(git)

    commit = capture_actions.add_parser("commit", help="capture safe metadata for one commit")
    commit.add_argument("ref", nargs="?", default="HEAD", help="commit ref (default: HEAD)")
    commit.add_argument("--repo", default=".", help="repository path (default: current directory)")
    add_common_flags(commit)

    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command != "capture":
        parser.error("only `capture` is implemented")

    command = build_local_capture_command(args)
    cwd = (
        os.path.abspath(os.path.expanduser(args.repo))
        if args.command == "capture" and args.capture_action == "commit"
        else None
    )
    return subprocess.run(command, cwd=cwd, check=False).returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
