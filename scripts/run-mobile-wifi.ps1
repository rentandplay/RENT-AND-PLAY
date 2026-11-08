# =============================================================================
# Rent & Play — Wireless Wi-Fi Mobile Debugger / Runner (No USB Cable Needed)
# =============================================================================
# Usage:
#   .\scripts\run-mobile-wifi.ps1
#   .\scripts\run-mobile-wifi.ps1 -PhoneIp 192.168.8.100
# =============================================================================

param(
  [string]$PhoneIp = "192.168.8.100",
  [int]$AdbPort = 5555,
  [int]$BackendPort = 3000
)

$ErrorActionPreference = "Continue"

$laptopIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|VMware|VirtualBox' -and $_.IPAddress -notlike '169.254.*' } |
  Sort-Object { if ($_.InterfaceAlias -match 'Wi-Fi') { 0 } else { 1 } } |
  Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $laptopIp) { $laptopIp = "127.0.0.1" }

$deviceTarget = "${PhoneIp}:${AdbPort}"
$apiBaseUrl = "http://${laptopIp}:${BackendPort}/api"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   RENT & PLAY — WIRELESS WI-FI MOBILE DEBUGGER" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  • Laptop Wi-Fi API:  $apiBaseUrl" -ForegroundColor Green
Write-Host "  • Phone ADB Target:  $deviceTarget" -ForegroundColor Green
Write-Host ""

# If USB is momentarily plugged in and phone isn't in tcpip mode yet, enable tcpip 5555
$adbList = adb devices
if ($adbList -notmatch [regex]::Escape($deviceTarget)) {
  if ($adbList -match '\bdevice\b') {
    Write-Host "[ADB] Switching connected phone to Wireless TCP mode ($AdbPort)..." -ForegroundColor Yellow
    adb -d tcpip $AdbPort | Out-Null
    Start-Sleep -Seconds 2
  }
  Write-Host "[ADB] Connecting wirelessly to $deviceTarget..." -ForegroundColor Yellow
  adb connect $deviceTarget
} else {
  Write-Host "[ADB] Already connected wirelessly to $deviceTarget" -ForegroundColor Green
}

$mobileDir = "C:\Final Project\AndroidFiles"
Set-Location $mobileDir

Write-Host ""
Write-Host "[Flutter] Launching wireless debug session (you can unplug USB!)..." -ForegroundColor Yellow
flutter run --no-pub -d $deviceTarget --dart-define="API_BASE_URL=$apiBaseUrl"
