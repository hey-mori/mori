#!/usr/bin/env pwsh
# Mori · Claude Code local hook (launcher, PowerShell)
#
# Forwards the Claude Code hook payload on stdin to the Python mapper,
# which classifies it and appends one typed Mori ConnectorEvent line to
# the local connector inbox. No network. No background scan. Raw payloads
# are never stored — summary metadata only.
#
# Requires Python on PATH. Remove this script + the matching Claude Code
# hook entries to uninstall.

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $dir "mori-claude-hook.py"

$python = "python"
if (-not (Get-Command $python -ErrorAction SilentlyContinue)) {
  $python = "python3"
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

[Console]::In.ReadToEnd() | & $python $script @args
