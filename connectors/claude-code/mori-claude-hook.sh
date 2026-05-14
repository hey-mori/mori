#!/usr/bin/env bash
# Mori · Claude Code local hook
#
# Reads one JSON hook payload from stdin, normalises it into a Mori
# ConnectorEvent line, and appends it to a local JSONL file.
#
# This script is opt-in. It does not phone home. It never writes anywhere
# other than the path you pass via --out. Remove the script + the
# matching Claude Code hook entry to uninstall.

set -eu

OUT_DIR="${HOME}/.mori/connectors/claude-code"
while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --out=*)
      OUT_DIR="${1#*=}"
      shift
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: mori-claude-hook.sh [--out DIR]
  Reads one Claude Code hook payload from stdin (JSON) and appends a
  Mori ConnectorEvent line to <OUT>/YYYY-MM-DD.jsonl.
USAGE
      exit 0
      ;;
    *)
      echo "mori-claude-hook: unknown arg $1" 1>&2
      exit 64
      ;;
  esac
done

OUT_DIR="${OUT_DIR/#\~/$HOME}"
mkdir -p "$OUT_DIR"
TODAY="$(date -u +%Y-%m-%d)"
OUT_FILE="$OUT_DIR/$TODAY.jsonl"

# Read the hook payload from stdin. We intentionally keep this script
# free of jq so it works on bare systems; Mori will normalise the JSON
# again on the import side.
PAYLOAD="$(cat)"

# Derive a few fields without parsing JSON: a UTC ISO 8601 timestamp + a
# coarse event id. Claude Code will provide the rest in $PAYLOAD.
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EVENT_ID="claude-hook-$(date -u +%Y%m%d%H%M%S)-$$"

# Truncate the payload defensively so a very large body cannot blow up
# the JSONL file. The Mori import path will validate the final line.
MAX_BYTES=2048
if [ ${#PAYLOAD} -gt $MAX_BYTES ]; then
  PAYLOAD="${PAYLOAD:0:$MAX_BYTES}"
fi

# Wrap the Claude Code payload inside a Mori ConnectorEvent envelope.
# `summary` is left as a placeholder string; the import path can replace
# it with a better summary based on the inner payload.
printf '{"id":"%s","connectorId":"claudeCodeHook","kind":"prompt_submitted","occurredAt":"%s","summary":"Claude Code hook event","rawText":%s,"privacy":{"captureMethod":"local_hook","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-claude-hook.sh","toolVersion":"0.1.0"}}\n' \
  "$EVENT_ID" "$NOW" "$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"<unparsed>"')" \
  >> "$OUT_FILE"
