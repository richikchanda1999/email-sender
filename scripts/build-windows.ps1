# Letterpress — Windows build script
#
# Run from the repo root on a Windows machine (PowerShell or pwsh):
#     .\scripts\build-windows.ps1            # plain build
#     .\scripts\build-windows.ps1 -Icons     # also regenerate icons
#     .\scripts\build-windows.ps1 -Clean     # wipe target/ first
#
# Prerequisites (one-time setup on the Windows box):
#   1. Node.js 20+            https://nodejs.org
#   2. Rust stable            https://rustup.rs  (runs rustup-init.exe)
#   3. Microsoft Edge WebView2 Runtime — preinstalled on Win11; the MSI pulls
#      it in as a dependency if missing.
#
# No separate NSIS / WiX install is required. Tauri's bundler downloads them
# on first run into %LOCALAPPDATA%\tauri\.
#
# Output:
#   src-tauri\target\release\bundle\msi\Letterpress_<ver>_x64_en-US.msi
#   src-tauri\target\release\bundle\nsis\Letterpress_<ver>_x64-setup.exe

param(
    [switch]$Icons,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name, [string]$Hint)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name not found on PATH. $Hint"
    }
}

Write-Host "==> Preflight" -ForegroundColor Cyan
Require-Command node  "Install Node.js 20+ from https://nodejs.org"
Require-Command npm   "npm ships with Node.js"
Require-Command rustc "Install Rust stable from https://rustup.rs"
Require-Command cargo "Install Rust stable from https://rustup.rs"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Write-Host "    repo root: $repoRoot"
Write-Host "    node:  $(node --version)"
Write-Host "    rustc: $((rustc --version) -replace '^rustc ', '')"

if ($Clean) {
    Write-Host "==> Cleaning previous build" -ForegroundColor Cyan
    if (Test-Path "src-tauri\target") { Remove-Item -Recurse -Force "src-tauri\target" }
    if (Test-Path "node_modules")     { Remove-Item -Recurse -Force "node_modules" }
}

Write-Host "==> Installing frontend dependencies (npm ci)" -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

if ($Icons) {
    Write-Host "==> Regenerating platform icons" -ForegroundColor Cyan
    npx --yes @tauri-apps/cli icon src-tauri/icons/icon.png
    if ($LASTEXITCODE -ne 0) { throw "icon generation failed" }
}

Write-Host "==> Building release bundle (this takes a few minutes on a cold cache)" -ForegroundColor Cyan
npm run tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

Write-Host ""
Write-Host "==> Artifacts" -ForegroundColor Green
$bundleDir = "src-tauri\target\release\bundle"
if (Test-Path $bundleDir) {
    Get-ChildItem -Recurse $bundleDir -Include *.msi, *.exe |
        ForEach-Object { Write-Host ("    " + $_.FullName) }
} else {
    Write-Host "    (none — check the build log above for errors)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Distribute the .msi for most users; the NSIS .exe is a smaller self-extracting alternative." -ForegroundColor Green
Write-Host "Both are unsigned — Windows SmartScreen will prompt once per version. Click 'More info' -> 'Run anyway'." -ForegroundColor DarkGray
