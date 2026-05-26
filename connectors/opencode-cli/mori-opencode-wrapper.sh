#!/usr/bin/env bash
# Mori · OpenCode CLI wrapper
#
# Wraps an OpenCode CLI invocation. Writes session_started + prompt_submitted
# + command_finished + session_finished JSONL events to a local Mori connector
# inbox file. Optionally captures a `git diff --shortstat` summary after the run.
#
# Local-only. No network calls. No credential capture. Summary-only: the
# OpenCode output body is never recorded. Opt-in: install the script yourself
# and invoke it explicitly.

set -eu

OUT_DIR="${HOME}/.mori/connectors/opencode-cli"
CAPTURE_GIT=0
SESSION_ID="opencode-$(date -u +%Y%m%d%H%M%S)-$$"

# Parse wrapper-level args. Everything after `--` is forwarded to OpenCode.
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
Usage: mori-opencode-wrapper.sh [--out DIR] [--git] [--session ID] -- opencode <args...>
  --out DIR     Where to append JSONL events (default ~/.mori/connectors/opencode-cli/<date>.jsonl)
  --git         Append a git diff --shortstat summary event after the run.
  --session ID  Group all events under this session id (default: auto-generated).
USAGE
      exit 0
      ;;
    *)
      echo "mori-opencode-wrapper: unexpected arg $1" 1>&2
      echo "  use -- to separate wrapper flags from the OpenCode command" 1>&2
      exit 64
      ;;
  esac
done

if [ $# -eq 0 ]; then
  echo "mori-opencode-wrapper: no opencode command provided" 1>&2
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

emit_session_started() {
  local now="$1"
  printf '{"id":"opencode-start-%s","connectorId":"openCodeCli","kind":"session_started","occurredAt":"%s","sessionId":"%s","summary":"OpenCode session: %s","sourceTitle":"OpenCode: %s","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-opencode-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$SESSION_ID" "$now" "$SESSION_ID" "$TASK_TRIMMED" "$TASK_TRIMMED" >> "$OUT_FILE"
}

emit_prompt_submitted() {
  local now="$1"
  printf '{"id":"opencode-prompt-%s","connectorId":"openCodeCli","kind":"prompt_submitted","occurredAt":"%s","sessionId":"%s","summary":"%s","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-opencode-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$SESSION_ID" "$now" "$SESSION_ID" "$TASK_TRIMMED" >> "$OUT_FILE"
}

emit_command_finished() {
  local now="$1" exit_code="$2" duration_ms="$3"
  printf '{"id":"opencode-cmd-%s","connectorId":"openCodeCli","kind":"command_finished","occurredAt":"%s","sessionId":"%s","command":"opencode (%s)","summary":"OpenCode run · exit %s · %sms","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-opencode-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$SESSION_ID" "$now" "$SESSION_ID" "$TASK_TRIMMED" "$exit_code" "$duration_ms" >> "$OUT_FILE"
}

emit_git_diff() {
  local now="$1"
  local stat
  stat="$(git diff --shortstat 2>/dev/null || true)"
  if [ -z "$stat" ]; then return; fi
  printf '{"id":"opencode-git-%s","connectorId":"openCodeCli","kind":"git_diff_captured","occurredAt":"%s","sessionId":"%s","summary":"git diff --shortstat: %s","git":{"repoPath":"%s"},"privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-opencode-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$SESSION_ID" "$now" "$SESSION_ID" "$stat" "$(pwd)" >> "$OUT_FILE"
}

emit_session_finished() {
  local now="$1" exit_code="$2"
  printf '{"id":"opencode-finish-%s","connectorId":"openCodeCli","kind":"session_finished","occurredAt":"%s","sessionId":"%s","summary":"OpenCode session finished · exit %s","privacy":{"captureMethod":"local_cli_wrapper","rawDataPolicy":"summary_only"},"provenance":{"toolName":"mori-opencode-wrapper.sh","toolVersion":"0.1.0"}}\n' \
    "$SESSION_ID" "$now" "$SESSION_ID" "$exit_code" >> "$OUT_FILE"
}

START_NOW="$(ISO_NOW)"
START_TS="$(date -u +%s)"
emit_session_started "$START_NOW"
emit_prompt_submitted "$START_NOW"

# Run the actual OpenCode command. We intentionally let stdout/stderr flow
# through so the user sees OpenCode output exactly as if the wrapper were
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

emit_session_finished "$END_NOW" "$EXIT_CODE"

exit "$EXIT_CODE"
