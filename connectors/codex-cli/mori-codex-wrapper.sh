#!/usr/bin/env bash
# Mori · Codex CLI wrapper
#
# Wraps a Codex CLI invocation. Writes session_started + command_finished
# JSONL events to a local Mori connector inbox file. Optionally captures
# a `git diff --shortstat` summary after the run.
#
# Local-only. No network calls. No credential capture. Opt-in: install
# the script yourself and invoke it explicitly.

set -eu

OUT_DIR="${HOME}/.mori/connectors/codex-cli"
CAPTURE_GIT=0
SESSION_ID="codex-$(date -u +%Y%m%d%H%M%S)-$$"

# Parse wrapper-level args. Everything after `--` is forwarded to Codex.
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
    --git)
      CAPTURE_GIT=1
      shift
      ;;
    --session)
      SESSION_ID="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: mori-codex-wrapper.sh [--out DIR] [--git] [--session ID] -- codex <args...>
  --out DIR     Where to append JSONL events (default ~/.mori/connectors/codex-cli/<date>.jsonl)
  --git         Append a git diff --shortstat summary event after the run.
  --session ID  Group all events under this session id (default: auto-generated).
USAGE
      exit 0
      ;;
    *)
      echo "mori-codex-wrapper: unexpected arg $1" 1>&2
      echo "  use -- to separate wrapper flags from the Codex command" 1>&2
      exit 64
      ;;
  esac
done

if [ $# -eq 0 ]; then
  echo "mori-codex-wrapper: no codex command provided" 1>&2
  exit 64
fi

OUT_DIR="${OUT_DIR/#\~/$HOME}"
mkdir -p "$OUT_DIR"
TODAY="$(date -u +%Y-%m-%d)"
OUT_FILE="$OUT_DIR/$TODAY.jsonl"

# Stringify the user prompt (everything after `--`). Keep it short so
# secrets are less likely to land in the log.
TASK="$*"
TASK_TRIMMED="${TASK:0:280}"

ISO_NOW() { date -u +%Y-%m-%dT%H:%M:%SZ; }
json_string() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read(), ensure_ascii=False))'
}

emit_session_started() {
  local now="$1"
  local event_id summary title q_event_id q_session q_summary q_title
  event_id="codex-start-$SESSION_ID"
  summary="Codex CLI session: $TASK_TRIMMED"
  title="Codex CLI: $TASK_TRIMMED"
  q_event_id="$(printf '%s' "$event_id" | json_string)"
  q_session="$(printf '%s' "$SESSION_ID" | json_string)"
  q_summary="$(printf '%s' "$summary" | json_string)"
  q_title="$(printf '%s' "$title" | json_string)"
  printf '{"id":%s,"connectorId":"codexCliWrapper","kind":"session_started","occurredAt":"%s","sessionId":%s,"summary":%s,"sourceTitle":%s,"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-codex-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$q_event_id" "$now" "$q_session" "$q_summary" "$q_title" >> "$OUT_FILE"
}

emit_command_finished() {
  local now="$1" exit_code="$2" duration_ms="$3"
  local event_id command summary q_event_id q_session q_command q_summary
  event_id="codex-cmd-$SESSION_ID"
  command="codex ($TASK_TRIMMED)"
  summary="Codex run · exit $exit_code · ${duration_ms}ms"
  q_event_id="$(printf '%s' "$event_id" | json_string)"
  q_session="$(printf '%s' "$SESSION_ID" | json_string)"
  q_command="$(printf '%s' "$command" | json_string)"
  q_summary="$(printf '%s' "$summary" | json_string)"
  printf '{"id":%s,"connectorId":"codexCliWrapper","kind":"command_finished","occurredAt":"%s","sessionId":%s,"command":%s,"summary":%s,"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-codex-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$q_event_id" "$now" "$q_session" "$q_command" "$q_summary" >> "$OUT_FILE"
}

emit_git_diff() {
  local now="$1"
  local stat
  stat="$(git diff --shortstat 2>/dev/null || true)"
  if [ -z "$stat" ]; then return; fi
  local event_id summary repo q_event_id q_session q_summary q_repo
  event_id="codex-git-$SESSION_ID"
  summary="git diff --shortstat: $stat"
  repo="$(pwd)"
  q_event_id="$(printf '%s' "$event_id" | json_string)"
  q_session="$(printf '%s' "$SESSION_ID" | json_string)"
  q_summary="$(printf '%s' "$summary" | json_string)"
  q_repo="$(printf '%s' "$repo" | json_string)"
  printf '{"id":%s,"connectorId":"codexCliWrapper","kind":"git_diff_captured","occurredAt":"%s","sessionId":%s,"summary":%s,"git":{"repoPath":%s},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-codex-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$q_event_id" "$now" "$q_session" "$q_summary" "$q_repo" >> "$OUT_FILE"
}

START_NOW="$(ISO_NOW)"
START_TS="$(date -u +%s)"
emit_session_started "$START_NOW"

# Run the actual Codex command. We intentionally let stdout/stderr flow
# through so the user sees Codex output exactly as if the wrapper were
# not there.
set +e
"$@"
EXIT_CODE=$?
set -e

END_NOW="$(ISO_NOW)"
END_TS="$(date -u +%s)"
DURATION_MS=$(((END_TS - START_TS) * 1000))
emit_command_finished "$END_NOW" "$EXIT_CODE" "$DURATION_MS"

if [ "$CAPTURE_GIT" -eq 1 ]; then
  emit_git_diff "$END_NOW"
fi

exit "$EXIT_CODE"
