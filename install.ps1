# PadDeck 2.0 is installed with the Windows installer (PadDeck-Setup-2.0.0.exe).
# This helper runs it if it has been built, otherwise builds everything first.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$setup = Get-ChildItem "$root\desktop\release\PadDeck-Setup-*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $setup) {
  Write-Host 'Building PadDeck (native helper, UI, desktop installer)...' -ForegroundColor Cyan
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$root\native\build.ps1"
  Push-Location "$root\companion"; npm install --omit=dev --no-audit --no-fund; Pop-Location
  Push-Location "$root\dashboard"; npm install --no-audit --no-fund; npm run build; Pop-Location
  Push-Location "$root\desktop"; npm install --no-audit --no-fund; npm run dist; Pop-Location
  $setup = Get-ChildItem "$root\desktop\release\PadDeck-Setup-*.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
}
Write-Host "Starting $($setup.Name)..." -ForegroundColor Green
Start-Process $setup.FullName
