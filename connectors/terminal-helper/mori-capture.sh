# Mori · terminal capture helper
#
# Source this file from your shell rc (~/.bashrc or ~/.zshrc):
#
#   source /path/to/mori/connectors/terminal-helper/mori-capture.sh
#
# It defines one function — `mori-capture` — that wraps the local-capture
# bridge so a terminal user has a short, explicit command to record work
# into Mori. It is strictly opt-in:
#
#   - Nothing runs until you type `mori-capture ...` yourself.
#   - No shell-history scraping, no prompt hook, no watcher, no daemon.
#   - It only ever passes the explicit path / text / repo you name on to
#     `mori-local-capture.py`, which captures metadata only.
#
# Set MORI_LOCAL_CAPTURE if you cloned Mori somewhere other than the
# default below.

MORI_LOCAL_CAPTURE="${MORI_LOCAL_CAPTURE:-$HOME/Dev/Projects/mori/connectors/local-capture/mori-local-capture.py}"

mori-capture() {
  local subcommand="$1"
  shift 2>/dev/null

  case "$subcommand" in
    git)
      # Safe Git snapshot metadata for the current repo.
      python3 "$MORI_LOCAL_CAPTURE" --git-repo . "$@"
      ;;
    commit)
      # Metadata for one commit (default HEAD): `mori-capture commit [ref]`.
      python3 "$MORI_LOCAL_CAPTURE" --git-repo . --git-commit "${1:-HEAD}"
      ;;
    note)
      # A manual note: `mori-capture note "what I just did"`.
      if [ -z "$1" ]; then
        echo "mori-capture: note text is required" >&2
        return 64
      fi
      python3 "$MORI_LOCAL_CAPTURE" --note "$*"
      ;;
    transcript)
      # A transcript file, or `-` for stdin: `... | mori-capture transcript -`.
      if [ -z "$1" ]; then
        echo "mori-capture: transcript path (or -) is required" >&2
        return 64
      fi
      python3 "$MORI_LOCAL_CAPTURE" --transcript "$1"
      ;;
    ""|help|-h|--help)
      cat >&2 <<'USAGE'
mori-capture — explicit local capture into ~/.mori/connectors/

  mori-capture git                 capture a Git snapshot of the current repo
  mori-capture commit [ref]        capture one commit's metadata (default HEAD)
  mori-capture note "<text>"       record a manual note
  mori-capture transcript <path>   capture a transcript file (or - for stdin)

Every capture is explicit. Review events in Mori -> Evidence Hub ->
Connector JSONL before they reach a session. No watcher, no history
scraping. Set MORI_LOCAL_CAPTURE to point at mori-local-capture.py.
USAGE
      ;;
    *)
      echo "mori-capture: unknown subcommand '$subcommand' (try 'mori-capture help')" >&2
      return 64
      ;;
  esac
}
