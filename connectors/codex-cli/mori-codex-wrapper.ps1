#!/usr/bin/env pwsh
# Mori · Codex CLI wrapper (PowerShell variant)
#
# Wraps a Codex CLI invocation. Writes session_started + command_finished
# events to a local JSONL connector inbox. Optional `-Git` flag adds a
# git diff --shortstat summary event after the run.
#
# Local-only. No network. No credential capture. Opt-in.

param(
  [string]$Out = "$env:USERPROFILE\.mori\connectors\codex-cli",
  [switch]$Git,
  [string]$Session = $null,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Command
)

$ErrorActionPreference = "Stop"

if (-not $Command -or $Command.Count -eq 0) {
  Write-Error "mori-codex-wrapper.ps1: no codex command provided. Example: mori-codex-wrapper.ps1 -- codex run 'task'"
  exit 64
}

if (-not (Test-Path -LiteralPath $Out)) {
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
}

$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$outFile = Join-Path $Out "$today.jsonl"

if (-not $Session) {
  $Session = "codex-{0}-{1}" -f (Get-Date -Format "yyyyMMddHHmmss"), $PID
}

$task = ($Command -join " ")
if ($task.Length -gt 280) { $task = $task.Substring(0, 280) }

function Now { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") }
function Emit($obj) {
  $line = $obj | ConvertTo-Json -Depth 6 -Compress
  Add-Content -LiteralPath $outFile -Value $line -Encoding utf8
}

$startNow = Now
$startTicks = [Diagnostics.Stopwatch]::StartNew()

Emit @{
  id           = "codex-start-$Session"
  connectorId  = "codexCliWrapper"
  kind         = "session_started"
  occurredAt   = $startNow
  sessionId    = $Session
  summary      = "Codex CLI session: $task"
  sourceTitle  = "Codex CLI: $task"
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-codex-wrapper.ps1"; toolVersion = "0.1.0" }
}

# Run Codex. Forward all stdout/stderr verbatim.
$proc = Start-Process -FilePath $Command[0] -ArgumentList ($Command[1..($Command.Count - 1)]) -NoNewWindow -PassThru -Wait
$exitCode = $proc.ExitCode

$startTicks.Stop()
$durationMs = [int]$startTicks.Elapsed.TotalMilliseconds
$endNow = Now

Emit @{
  id           = "codex-cmd-$Session"
  connectorId  = "codexCliWrapper"
  kind         = "command_finished"
  occurredAt   = $endNow
  sessionId    = $Session
  command      = "codex ($task)"
  summary      = "Codex run · exit $exitCode · ${durationMs}ms"
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-codex-wrapper.ps1"; toolVersion = "0.1.0" }
}

if ($Git) {
  $stat = (& git diff --shortstat 2>$null) -join " "
  if ($stat) {
    Emit @{
      id           = "codex-git-$Session"
      connectorId  = "codexCliWrapper"
      kind         = "git_diff_captured"
      occurredAt   = $endNow
      sessionId    = $Session
      summary      = "git diff --shortstat: $stat"
      git          = @{ repoPath = (Get-Location).Path }
      privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
      provenance   = @{ toolName = "mori-codex-wrapper.ps1"; toolVersion = "0.1.0" }
    }
  }
}

exit $exitCode
