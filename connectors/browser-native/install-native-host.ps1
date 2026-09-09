param(
  [ValidateSet("chrome", "edge")]
  [string]$Browser = "chrome",

  [Parameter(Mandatory = $true)]
  [string]$HostPath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-pA-P]{32}$")]
  [string[]]$ExtensionId,

  [string]$ManifestPath = ""
)

$ErrorActionPreference = "Stop"

$HostName = "com.swarea.mori.browser"
$Description = "Mori Browser observation receiver"

$resolvedHost = (Resolve-Path -LiteralPath $HostPath).Path

if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $manifestDir = Join-Path $env:LOCALAPPDATA "Mori\NativeMessagingHosts"
  $ManifestPath = Join-Path $manifestDir "$HostName.json"
} else {
  $manifestDir = Split-Path -Parent $ManifestPath
}

New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null

$allowedOrigins = @()
foreach ($id in $ExtensionId) {
  $allowedOrigins += "chrome-extension://$($id.ToLowerInvariant())/"
}

$manifest = [ordered]@{
  name = $HostName
  description = $Description
  path = $resolvedHost
  type = "stdio"
  allowed_origins = $allowedOrigins
}

$manifestJson = $manifest | ConvertTo-Json -Depth 4
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[System.IO.File]::WriteAllText($ManifestPath, $manifestJson + [Environment]::NewLine, $utf8NoBom)

if ($Browser -eq "edge") {
  $registryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
} else {
  $registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
}

New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value (Resolve-Path -LiteralPath $ManifestPath).Path

Write-Host "Registered $HostName for $Browser at $ManifestPath"
