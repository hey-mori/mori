# Mori CLI wrapper

`mori.py` is the first small CLI front door for explicit local capture. It
does **not** create a new connector schema. It delegates to
[`../local-capture/mori-local-capture.py`](../local-capture/mori-local-capture.py),
so output is the same Connector JSONL that already goes through Evidence Hub →
Connector JSONL → Import Review.

## Commands

```bash
python3 mori.py capture note "Decided to keep review-before-apply"
python3 mori.py capture transcript ~/notes/claude-session.txt
some-command | python3 mori.py capture transcript -
python3 mori.py capture git --repo .
python3 mori.py capture commit HEAD --repo .
python3 mori.py run --connector codex -- codex run "Upgrade dependencies"
python3 mori.py run --connector opencode -- opencode run "Add retry"
```

Common flags:

- `--out DIR` writes to a chosen connector inbox directory.
- `--session ID` groups emitted events under an explicit connector session id.
- `--local-capture PATH` points at a custom `mori-local-capture.py`.

## Install as `mori`

For local development, symlink the script into a directory on your `PATH`:

```bash
mkdir -p ~/.local/bin
ln -sf /path/to/mori/connectors/mori-cli/mori.py ~/.local/bin/mori
chmod +x /path/to/mori/connectors/mori-cli/mori.py
```

Then call:

```bash
mori capture note "Wrapped the connector smoke tests"
mori capture git --repo .
mori run --connector codex -- codex run "Review the import path"
```

If Mori is cloned somewhere unusual, set `MORI_LOCAL_CAPTURE` so the CLI can
find the underlying capture bridge:

```bash
export MORI_LOCAL_CAPTURE="/path/to/mori/connectors/local-capture/mori-local-capture.py"
```

For `mori run`, the CLI uses the bundled POSIX wrappers by default. Override
them only if you have installed custom wrapper scripts:

```bash
export MORI_CODEX_WRAPPER="/path/to/mori-codex-wrapper.sh"
export MORI_OPENCODE_WRAPPER="/path/to/mori-opencode-wrapper.sh"
```

## Boundary

This CLI is deliberately small:

- no daemon;
- no watcher;
- no shell history or terminal scrollback read;
- `mori run` records command metadata only; it does not retain stdout/stderr
  bodies;
- no import without Import Review.
