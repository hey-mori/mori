#!/usr/bin/env python3
"""Mori MCP capture server (template).

An explicit, local-only Model Context Protocol server. An MCP host (Claude
Desktop, etc.) can call its `capture_note` / `capture_session` tools to hand
Mori a piece of work evidence. Each call appends one Mori connector event
(JSONL) to `~/.mori/connectors/mcp/<date>.jsonl`. Mori imports that file only
when the user clicks Import, and every event flows through Import Review before
it touches a session.

> Mori does NOT install or auto-register this server. It is an explicit opt-in
> template: read it, then register it with your MCP host yourself. The server
> only ever writes a local JSONL file - it never reads the host app's memory,
> never polls, and never sends anything over the network.

Requirements:
    pip install "mcp[cli]"

Register with an MCP host (example, Claude Desktop config):
    {
      "mcpServers": {
        "mori-capture": {
          "command": "python",
          "args": ["/absolute/path/to/mori-mcp-server.py"]
        }
      }
    }

Then, in the host, ask the AI to capture: e.g. "use mori capture_session to
save a summary of what we did". The event lands in the Mori inbox; open Mori,
go to Connector JSONL, Refresh inbox, pick the mcp file, and review.
"""

import datetime
import json
import os
import uuid
from pathlib import Path

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as exc:  # pragma: no cover - template guidance only
    raise SystemExit(
        'The "mcp" package is required. Install it with: pip install "mcp[cli]"'
    ) from exc

TOOL_NAME = "mori-mcp-server.py"
TOOL_VERSION = "0.1.0"

# A stable per-process session id so several captures in one host session group
# into a single Mori source. The host can override it per call.
PROCESS_SESSION_ID = f"mcp-{uuid.uuid4().hex[:12]}"

mcp = FastMCP("mori-capture")


def _inbox_dir() -> Path:
    # Honor MORI_HOME for tests / relocation; default to ~/.mori.
    root = os.environ.get("MORI_HOME") or str(Path.home() / ".mori")
    inbox = Path(root) / "connectors" / "mcp"
    inbox.mkdir(parents=True, exist_ok=True)
    return inbox


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _append_event(event: dict) -> str:
    inbox = _inbox_dir()
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    target = inbox / f"{day}.jsonl"
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return str(target)


def _base_event(kind: str, summary: str, session_id: str, project_path: str) -> dict:
    event = {
        "id": uuid.uuid4().hex,
        "connectorId": "mcpServer",
        "kind": kind,
        "occurredAt": _now_iso(),
        "sessionId": session_id or PROCESS_SESSION_ID,
        "summary": summary.strip()[:280] or "(empty)",
        "privacy": {
            "captureMethod": "local_mcp",
            "rawDataPolicy": "summary_only",
            "redacted": False,
            "note": "Captured via the local Mori MCP server. Local JSONL only, no network.",
        },
        "provenance": {"toolName": TOOL_NAME, "toolVersion": TOOL_VERSION},
    }
    if project_path:
        event["projectPath"] = project_path
    return event


@mcp.tool()
def capture_note(summary: str, project_path: str = "", session_id: str = "") -> str:
    """Capture a single note (a decision, an insight, a TODO) into Mori.

    Args:
        summary: A short, single-line description of the note.
        project_path: Optional working directory the note relates to.
        session_id: Optional id to group captures into one Mori source.
    """
    event = _base_event("assistant_message", summary, session_id, project_path)
    path = _append_event(event)
    return f"Captured note to {path}. Review it in Mori > Connector JSONL > Refresh inbox."


@mcp.tool()
def capture_session(
    title: str,
    summary: str,
    project_path: str = "",
    session_id: str = "",
) -> str:
    """Capture a session summary (what was worked on) into Mori.

    Args:
        title: A short title for the session.
        summary: A one-line summary of what happened.
        project_path: Optional working directory.
        session_id: Optional id to group captures into one Mori source.
    """
    event = _base_event("transcript_imported", summary, session_id, project_path)
    if title.strip():
        event["sourceTitle"] = title.strip()[:120]
    path = _append_event(event)
    return f"Captured session to {path}. Review it in Mori > Connector JSONL > Refresh inbox."


if __name__ == "__main__":
    mcp.run()
