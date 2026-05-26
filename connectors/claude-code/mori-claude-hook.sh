#!/usr/bin/env bash
# Mori · Claude Code local hook (launcher)
#
# Forwards the Claude Code hook payload on stdin to the Python mapper,
# which classifies it and appends one typed Mori ConnectorEvent line to
# the local connector inbox. No network. No background scan. Raw payloads
# are never stored — summary metadata only.
#
# Requires python3 on PATH. Remove this script + the matching Claude Code
# hook entries to uninstall.
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$DIR/mori-claude-hook.py" "$@"
