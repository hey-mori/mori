param(
  [ValidateSet("chrome", "edge")]
  [string]$Browser = "chrome",

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
  Remove-Item -LiteralPath $registryPath -Recurse -Force
  Write-Host "Removed $registryPath"
} else {
  Write-Host "$registryPath was not registered"
}

if ($RemoveManifest) {
  $manifestPath = Join-Path $env:LOCALAPPDATA "Mori\NativeMessagingHosts\$HostName.json"
  if (Test-Path -LiteralPath $manifestPath) {
    Remove-Item -LiteralPath $manifestPath -Force
    Write-Host "Removed $manifestPath"
  }
}
