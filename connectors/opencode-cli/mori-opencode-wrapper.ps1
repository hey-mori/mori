#!/usr/bin/env pwsh
# Mori · OpenCode CLI wrapper (PowerShell variant)
#
# Wraps an OpenCode CLI invocation. Writes session_started + prompt_submitted
# + command_finished + session_finished events to a local JSONL connector
# inbox. Optional `-Git` flag adds a git diff --shortstat summary event.
#
# Local-only. No network. No credential capture. Summary-only. Opt-in.

param(
  [string]$Out = "$env:USERPROFILE\.mori\connectors\opencode-cli",
  [switch]$Git,
  [string]$Session = $null,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Command
)

$ErrorActionPreference = "Stop"

if (-not $Command -or $Command.Count -eq 0) {
  Write-Error "mori-opencode-wrapper.ps1: no opencode command provided. Example: mori-opencode-wrapper.ps1 -- opencode run 'task'"
  exit 64
}

if (-not (Test-Path -LiteralPath $Out)) {
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
}

$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$outFile = Join-Path $Out "$today.jsonl"

if (-not $Session) {
  $Session = "opencode-{0}-{1}" -f (Get-Date -Format "yyyyMMddHHmmss"), $PID
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
  id           = "opencode-start-$Session"
  connectorId  = "openCodeCli"
  kind         = "session_started"
  occurredAt   = $startNow
  sessionId    = $Session
  summary      = "OpenCode session: $task"
  sourceTitle  = "OpenCode: $task"
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-opencode-wrapper.ps1"; toolVersion = "0.1.0" }
}

Emit @{
  id           = "opencode-prompt-$Session"
  connectorId  = "openCodeCli"
  kind         = "prompt_submitted"
  occurredAt   = $startNow
  sessionId    = $Session
  summary      = $task
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-opencode-wrapper.ps1"; toolVersion = "0.1.0" }
}

# Run OpenCode. Forward all stdout/stderr verbatim.
$proc = Start-Process -FilePath $Command[0] -ArgumentList ($Command[1..($Command.Count - 1)]) -NoNewWindow -PassThru -Wait
$exitCode = $proc.ExitCode

$startTicks.Stop()
$durationMs = [int]$startTicks.Elapsed.TotalMilliseconds
$endNow = Now

Emit @{
  id           = "opencode-cmd-$Session"
  connectorId  = "openCodeCli"
  kind         = "command_finished"
  occurredAt   = $endNow
  sessionId    = $Session
  command      = "opencode ($task)"
  summary      = "OpenCode run · exit $exitCode · ${durationMs}ms"
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-opencode-wrapper.ps1"; toolVersion = "0.1.0" }
}

if ($Git) {
  $stat = (& git diff --shortstat 2>$null) -join " "
  if ($stat) {
    Emit @{
      id           = "opencode-git-$Session"
      connectorId  = "openCodeCli"
      kind         = "git_diff_captured"
      occurredAt   = $endNow
      sessionId    = $Session
      summary      = "git diff --shortstat: $stat"
      git          = @{ repoPath = (Get-Location).Path }
      privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
      provenance   = @{ toolName = "mori-opencode-wrapper.ps1"; toolVersion = "0.1.0" }
    }
  }
}

Emit @{
  id           = "opencode-finish-$Session"
  connectorId  = "openCodeCli"
  kind         = "session_finished"
  occurredAt   = $endNow
  sessionId    = $Session
  summary      = "OpenCode session finished · exit $exitCode"
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-opencode-wrapper.ps1"; toolVersion = "0.1.0" }
}

exit $exitCode
