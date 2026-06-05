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
  Write-Error "mori-opencode-wrapper.ps1: no opencode command provided. Example: mori-opencode-wrapper.ps1 opencode run 'task'"
  exit 64
}

if ($Command[0] -eq "--") {
  $Command = @($Command | Select-Object -Skip 1)
}

if (-not $Command -or $Command.Count -eq 0) {
  Write-Error "mori-opencode-wrapper.ps1: no opencode command provided after -- separator."
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

# Write UTF-8 without a BOM. Windows PowerShell 5.1's `Add-Content -Encoding
# utf8` prepends a BOM, which corrupts the first JSONL line for strict
# parsers. Build the middle-dot separator from its code point so this script
# stays pure ASCII on disk; PS 5.1 reads a BOM-less .ps1 as the system
# codepage (cp949 here), which would otherwise mangle a literal "·".
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
$Dot = [char]0x00B7

function Now { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") }
function Emit($obj) {
  $line = $obj | ConvertTo-Json -Depth 6 -Compress
  [System.IO.File]::AppendAllText($outFile, $line + "`n", $Utf8NoBom)
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

# Run OpenCode. Forward all stdout/stderr verbatim and preserve argument
# boundaries for quotes / non-ASCII text.
$exe = $Command[0]
$commandArgs = @()
if ($Command.Count -gt 1) {
  $commandArgs = $Command[1..($Command.Count - 1)]
}
& $exe @commandArgs
$exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }

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
  summary      = "OpenCode run $Dot exit $exitCode $Dot ${durationMs}ms"
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-opencode-wrapper.ps1"; toolVersion = "0.1.0" }
}

if ($Git) {
  # git writes benign warnings (e.g. LF/CRLF) to stderr; under
  # ErrorActionPreference=Stop PS 5.1 turns that into a terminating
  # NativeCommandError that would crash the wrapper after the run. Relax it
  # locally and discard stderr.
  $stat = ""
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try { $stat = ((& git diff --shortstat 2>$null) -join " ").Trim() } catch { $stat = "" }
  $ErrorActionPreference = $prevEap
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
  summary      = "OpenCode session finished $Dot exit $exitCode"
  privacy      = @{ captureMethod = "local_cli_wrapper"; rawDataPolicy = "summary_only" }
  provenance   = @{ toolName = "mori-opencode-wrapper.ps1"; toolVersion = "0.1.0" }
}

exit $exitCode
