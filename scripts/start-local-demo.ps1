# =============================================================================
# Rent & Play — Final Defense Fail-Safe & Local Hotspot Demo Launcher
# =============================================================================
# Usage:
#   .\scripts\start-local-demo.ps1
#
# What this script does:
# 1. Detects your laptop's Local Wi-Fi / Hotspot IPv4 address for mobile testing.
# 2. Pings the live Render + Supabase backend (/api/health) to wake up cold starts.
# 3. Starts the local Node.js backend + Web Admin on port 3000 (0.0.0.0) so both
#    Web Admin and the Flutter Mobile App can connect over a local Wi-Fi hotspot
#    even if venue internet is unstable during defense.
# =============================================================================

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   RENT & PLAY — FINAL DEFENSE FAIL-SAFE LAUNCHER" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# 1. Detect Local IPv4 Address (prefer Wi-Fi / LAN over VMware / virtual adapters)
$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|VMware|VirtualBox' -and $_.IPAddress -notlike '169.254.*' } |
  Sort-Object { if ($_.InterfaceAlias -match 'Wi-Fi') { 0 } else { 1 } } |
  Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $localIp) { $localIp = "127.0.0.1" }

Write-Host ""
Write-Host "[1/3] Local Network / Hotspot Readiness:" -ForegroundColor Yellow
Write-Host "  • Web Admin (Local):      http://localhost:3000" -ForegroundColor Green
Write-Host "  • Web Admin (LAN/Wi-Fi):  http://${localIp}:3000" -ForegroundColor Green
Write-Host "  • Flutter Mobile LAN Cmd: flutter run --dart-define=API_BASE_URL=http://${localIp}:3000/api" -ForegroundColor Green

# 2. Warm up Cloud Render + Supabase Health Endpoint
Write-Host ""
Write-Host "[2/3] Checking Cloud Hybrid Stack (Firebase Auth + Supabase DB)..." -ForegroundColor Yellow
try {
  $health = Invoke-RestMethod -Uri "https://rent-and-play.onrender.com/api/health" -TimeoutSec 10
  Write-Host ("  • Cloud Status: ONLINE (Provider: {0}, DB Ready: {1}, Firebase: {2})" -f $health.provider, $health.database, $health.firebaseProjectId) -ForegroundColor Green
} catch {
  Write-Host "  • Cloud health check timed out or offline — Local server below will act as fail-safe!" -ForegroundColor DarkYellow
}

# 3. Ensure Web Bundle & Dependencies Exist Before Starting Server
$webDistIndex = Join-Path $RepoRoot "apps\web\dist\index.html"
$webModules = Join-Path $RepoRoot "apps\web\node_modules"
$backendModules = Join-Path $RepoRoot "apps\backend\node_modules"
if (-not (Test-Path $webDistIndex) -or -not (Test-Path $webModules) -or -not (Test-Path $backendModules)) {
  Write-Host ""
  Write-Host "[Prep] Installing dependencies and building Web Admin bundle..." -ForegroundColor Yellow
  npm run build
}

# 4. Start Local Backend + Web Admin Server
Write-Host ""
Write-Host "[3/3] Starting Local Backend & Web Admin Server on Port 3000..." -ForegroundColor Yellow
Write-Host "  (Press Ctrl+C to stop the server)" -ForegroundColor Gray
Write-Host ""

Set-Location (Join-Path $RepoRoot "apps\backend")
$env:PORT = "3000"
npm start
