param(
  [ValidateSet("chrome", "edge")]
  [string]$Browser = "chrome",

  [string]$ManifestPath = "",

  [string]$ExpectedManifestPath = "",

  [switch]$RemoveManifest
)

$ErrorActionPreference = "Stop"

$HostName = "com.swarea.mori.browser"

if ($Browser -eq "edge") {
  $registryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
} else {
  $registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
}

if (Test-Path -LiteralPath $registryPath) {
  $item = Get-Item -LiteralPath $registryPath
  $currentManifestPath = [string]$item.GetValue("")
  $shouldRemoveRegistry = $true
  if (-not [string]::IsNullOrWhiteSpace($ExpectedManifestPath)) {
    $shouldRemoveRegistry = [string]::Equals(
      [System.IO.Path]::GetFullPath($currentManifestPath),
      [System.IO.Path]::GetFullPath($ExpectedManifestPath),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  }

  if ($shouldRemoveRegistry) {
    Remove-Item -LiteralPath $registryPath -Recurse -Force
    Write-Host "Removed $registryPath"
  } else {
    Write-Host "$registryPath points to $currentManifestPath, leaving it in place"
  }
} else {
  Write-Host "$registryPath was not registered"
}

if ($RemoveManifest) {
  $manifestPath = $ManifestPath
  if ([string]::IsNullOrWhiteSpace($manifestPath)) {
    $manifestPath = Join-Path $env:LOCALAPPDATA "Mori\NativeMessagingHosts\$HostName.json"
  }
  if (Test-Path -LiteralPath $manifestPath) {
    Remove-Item -LiteralPath $manifestPath -Force
    Write-Host "Removed $manifestPath"
  }
}
