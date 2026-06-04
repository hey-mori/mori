# Mori - terminal capture helper (PowerShell variant)
#
# Dot-source this file from your PowerShell profile ($PROFILE):
#
#   . C:\path\to\mori\connectors\terminal-helper\mori-capture.ps1
#
# It defines one function, `mori-capture`, that wraps the local-capture
# bridge so a terminal user has a short, explicit command to record work
# into Mori. It is strictly opt-in:
#
#   - Nothing runs until you type `mori-capture ...` yourself.
#   - No shell-history scraping, no prompt hook, no watcher, no daemon.
#   - It only ever passes the explicit path / text / repo you name on to
#     mori-local-capture.py, which captures metadata only.
#
# Set $env:MORI_LOCAL_CAPTURE if you cloned Mori somewhere other than the
# default below.

if (-not $env:MORI_LOCAL_CAPTURE) {
  $env:MORI_LOCAL_CAPTURE = Join-Path $HOME "Dev\Projects\mori\connectors\local-capture\mori-local-capture.py"
}

function mori-capture {
  [CmdletBinding()]
  param(
    [Parameter(Position = 0)]
    [string]$Subcommand,
    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Rest
  )

  # Windows ships `python`; some setups only have `python3`. Resolve at call
  # time so a PATH change after sourcing is still honored.
  $python = if (Get-Command python -ErrorAction SilentlyContinue) { "python" }
            elseif (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" }
            else { $null }
  if (-not $python) {
    Write-Error "mori-capture: python was not found on PATH"
    return
  }
  $script = $env:MORI_LOCAL_CAPTURE

  switch ($Subcommand) {
    "git" {
      # Safe Git snapshot metadata for the current repo.
      & $python $script --git-repo . @Rest
    }
    "commit" {
      # Metadata for one commit (default HEAD): `mori-capture commit [ref]`.
      $ref = if ($Rest -and $Rest[0]) { $Rest[0] } else { "HEAD" }
      & $python $script --git-repo . --git-commit $ref
    }
    "note" {
      # A manual note: `mori-capture note "what I just did"`.
      $text = ($Rest -join " ").Trim()
      if (-not $text) {
        Write-Error "mori-capture: note text is required"
        return
      }
      & $python $script --note $text
    }
    "transcript" {
      # A transcript file, or `-` for stdin: `... | mori-capture transcript -`.
      if (-not ($Rest -and $Rest[0])) {
        Write-Error "mori-capture: transcript path (or -) is required"
        return
      }
      if ($Rest[0] -eq "-") {
        $input | & $python $script --transcript -
      } else {
        & $python $script --transcript $Rest[0]
      }
    }
    { $_ -in @($null, "", "help", "-h", "--help") } {
      Write-Output @"
mori-capture - explicit local capture into ~/.mori/connectors/

  mori-capture git                 capture a Git snapshot of the current repo
  mori-capture commit [ref]        capture one commit's metadata (default HEAD)
  mori-capture note "<text>"       record a manual note
  mori-capture transcript <path>   capture a transcript file (or - for stdin)

Every capture is explicit. Review events in Mori -> Evidence Hub ->
Connector JSONL before they reach a session. No watcher, no history
scraping. Set `$env:MORI_LOCAL_CAPTURE` to point at mori-local-capture.py.
"@
    }
    default {
      Write-Error "mori-capture: unknown subcommand '$Subcommand' (try 'mori-capture help')"
    }
  }
}
