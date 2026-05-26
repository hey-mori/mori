#!/usr/bin/env python3
"""Mori · Claude Code local hook.

Reads one Claude Code hook payload from stdin, maps it to a *typed* Mori
ConnectorEvent, and appends one JSONL line to the local Mori connector
inbox. No network. No background scan. The raw prompt / tool payload is
never stored — only summary metadata (``rawDataPolicy: summary_only``).

Claude Code invokes this once per hook event with a JSON object on stdin
carrying ``hook_event_name`` plus event-specific fields. We translate that
into the connector schema documented in
``docs/connectors/connector-event-format.md`` so each event reaches Mori
already classified (a prompt, a file change, a command, a session
boundary) instead of an opaque blob the import side has to guess at.

This script must never break the user's Claude Code session: on any error,
and for any hook event it does not map, it writes nothing and exits 0.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from datetime import datetime, timezone

TOOL_VERSION = "0.2.0"
CONNECTOR_ID = "claudeCodeHook"

# PostToolUse tools whose effect is a file change.
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _one_line(text: object, limit: int = 160) -> str:
    collapsed = " ".join(str(text).split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


def _tool_path(tool_input: object) -> str | None:
    if not isinstance(tool_input, dict):
        return None
    for key in ("file_path", "notebook_path", "path"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _basename(path: str) -> str:
    return os.path.basename(path.rstrip("/\\")) or path


def map_payload(payload: dict, occurred_at: str) -> dict | None:
    """Translate a Claude Code hook payload into a Mori ConnectorEvent dict.

    Returns ``None`` for hook events Mori does not record (the caller then
    writes nothing).
    """
    event_name = payload.get("hook_event_name") or payload.get("hookEventName")
    session_id = payload.get("session_id") or payload.get("sessionId")
    cwd = payload.get("cwd")
    micros = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    event_id = f"claude-{str(event_name or 'event').lower()}-{micros}-{os.getpid()}"

    base: dict = {
        "id": event_id,
        "connectorId": CONNECTOR_ID,
        "occurredAt": occurred_at,
        "privacy": {"captureMethod": "local_hook", "rawDataPolicy": "summary_only"},
        "provenance": {
            "toolName": "mori-claude-hook.py",
            "toolVersion": TOOL_VERSION,
            "host": socket.gethostname(),
        },
    }
    if isinstance(session_id, str) and session_id:
        base["sessionId"] = session_id
    if isinstance(cwd, str) and cwd:
        base["projectPath"] = cwd

    if event_name == "UserPromptSubmit":
        base["kind"] = "prompt_submitted"
        base["summary"] = _one_line(payload.get("prompt") or "") or "User prompt"
        return base

    if event_name == "SessionStart":
        repo = _basename(cwd) if isinstance(cwd, str) and cwd else None
        base["kind"] = "session_started"
        base["summary"] = "Claude Code session started" + (f" · {repo}" if repo else "")
        if repo:
            base["sourceTitle"] = f"Claude Code · {repo}"
        return base

    if event_name == "SessionEnd":
        reason = payload.get("reason")
        suffix = f" · {reason}" if isinstance(reason, str) and reason else ""
        base["kind"] = "session_finished"
        base["summary"] = "Claude Code session ended" + suffix
        return base

    if event_name in ("PreToolUse", "PostToolUse"):
        tool_name = payload.get("tool_name") or payload.get("toolName")
        if not isinstance(tool_name, str) or not tool_name:
            return None
        tool_input = payload.get("tool_input") or payload.get("toolInput") or {}
        finished = event_name == "PostToolUse"

        # File-editing tools → file_changed (needs filePath).
        if tool_name in EDIT_TOOLS:
            path = _tool_path(tool_input)
            if path:
                base["kind"] = "file_changed"
                base["filePath"] = path
                base["summary"] = f"{'Edited' if finished else 'Editing'} {_basename(path)}"
                return base
            # No path → fall through to a generic tool event.

        # Bash → command_started / command_finished (needs command).
        if tool_name == "Bash":
            command = tool_input.get("command") if isinstance(tool_input, dict) else None
            if isinstance(command, str) and command.strip():
                base["kind"] = "command_finished" if finished else "command_started"
                base["command"] = _one_line(command, 400)
                base["summary"] = f"$ {_one_line(command)} · {'ran' if finished else 'started'}"
                return base
            # No command → fall through to a generic tool event.

        # Everything else (Read, Grep, Glob, Task, WebFetch, …) → tool event.
        path = _tool_path(tool_input)
        hint = f" · {_basename(path)}" if path else ""
        base["kind"] = "tool_finished" if finished else "tool_started"
        base["tool"] = {"name": tool_name}
        base["summary"] = f"{tool_name} {'finished' if finished else 'started'}{hint}"
        return base

    # Notification / Stop / SubagentStop / PreCompact / unknown → not recorded.
    # (Stop fires on every assistant turn; only SessionEnd marks a real end.)
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Mori Claude Code hook → connector JSONL")
    default_out = os.path.join(os.path.expanduser("~"), ".mori", "connectors", "claude-code")
    parser.add_argument("--out", default=default_out, help="Output directory for dated JSONL files.")
    args, _ = parser.parse_known_args()

    raw = sys.stdin.read()
    if not raw.strip():
        return 0
    try:
        payload = json.loads(raw)
    except (ValueError, TypeError):
        return 0
    if not isinstance(payload, dict):
        return 0

    event = map_payload(payload, _utc_now())
    if event is None:
        return 0

    out_dir = os.path.expanduser(args.out)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, datetime.now(timezone.utc).strftime("%Y-%m-%d") + ".jsonl")
    with open(out_file, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # A hook must never break the user's Claude Code session.
        sys.exit(0)
