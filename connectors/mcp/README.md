# Mori · MCP capture server template

A small, local-only **Model Context Protocol** server that lets an MCP host
(Claude Desktop, etc.) hand Mori a piece of work evidence on explicit request.
Each tool call appends one Mori connector event (JSONL) to
`~/.mori/connectors/mcp/<date>.jsonl`, which you then import through the normal
Connector JSONL → Import Review path.

> Mori does **not** install or auto-register this server. It is an explicit
> opt-in template: read the script, register it with your host yourself, and
> ask the AI to call its capture tools. The server only writes a local JSONL
> file.

## What this server does

- Exposes two tools: `capture_note` (a single note) and `capture_session`
  (a session summary)
- Appends one connector event per call to
  `~/.mori/connectors/mcp/<date>.jsonl` (events use `connectorId: "mcpServer"`,
  `privacy.captureMethod: "local_mcp"`, `rawDataPolicy: "summary_only"`)
- Returns a short confirmation string to the host

## What this server never does

- It does **not** read the host app's memory, conversation store, or files
- It does **not** poll, watch, or run anything in the background
- It does **not** send anything over the network
- It does **not** capture anything except the `summary` / `title` text the host
  explicitly passes to a tool

## Files

- [`mori-mcp-server.py`](./mori-mcp-server.py) — the FastMCP server.
- [`sample-event.jsonl`](./sample-event.jsonl) — two sample events
  (a note + a session summary) in the exact shape the server writes.

## Setup

```bash
pip install "mcp[cli]"
```

Register with your MCP host (Claude Desktop example):

```jsonc
{
  "mcpServers": {
    "mori-capture": {
      "command": "python",
      "args": ["/absolute/path/to/connectors/mcp/mori-mcp-server.py"]
    }
  }
}
```

## Usage

In the host, ask the AI to capture explicitly, e.g.:

> "Use mori capture_session to save a one-line summary of what we just did."

Then open Mori → **Connector JSONL** → **Refresh inbox**, pick today's file
under the `mcp` family, and review. Nothing is applied until you confirm in
Import Review.

## Uninstall

Remove the `mori-capture` entry from your host's MCP config and delete the
JSONL files under `~/.mori/connectors/mcp/`. Mori never writes back into the
directory.

## See also

- [Connector event format](../../docs/connectors/connector-event-format.md)
- [Capture surface matrix](../../docs/connectors/capture-surface-matrix.md)
