#!/usr/bin/env pwsh
# Mori · Claude Code local hook (PowerShell variant)
#
# Reads one Claude Code hook payload from stdin, wraps it in a Mori
# ConnectorEvent envelope, and appends one JSONL line to the user's
# local Mori connector inbox. No network. No background scan.

param(
  [string]$Out = "$env:USERPROFILE\.mori\connectors\claude-code"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Out)) {
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
}

$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$outFile = Join-Path $Out "$today.jsonl"
$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$eventId = "claude-hook-{0}-{1}" -f (Get-Date -Format "yyyyMMddHHmmss"), $PID

# Read the entire hook payload from stdin.
$payload = [Console]::In.ReadToEnd()
if ($payload.Length -gt 2048) {
  $payload = $payload.Substring(0, 2048)
}

$envelope = [PSCustomObject]@{
  id           = $eventId
  connectorId  = "claudeCodeHook"
  kind         = "prompt_submitted"
  occurredAt   = $now
  summary      = "Claude Code hook event"
  rawText      = $payload
  privacy      = [PSCustomObject]@{
    captureMethod  = "local_hook"
    rawDataPolicy  = "summary_only"
  }
  provenance   = [PSCustomObject]@{
    toolName     = "mori-claude-hook.ps1"
    toolVersion  = "0.1.0"
  }
}

# ConvertTo-Json with -Compress writes a single line, perfect for JSONL.
$line = $envelope | ConvertTo-Json -Depth 6 -Compress
Add-Content -LiteralPath $outFile -Value $line -Encoding utf8
