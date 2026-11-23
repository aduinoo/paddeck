# PadDeck companion installer (per-user, no administrator rights needed).
# Usage (from this folder):  powershell -ExecutionPolicy Bypass -File install.ps1 [-AutoStart] [-NoLaunch]
param([switch]$AutoStart, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }

Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'Node.js is not installed. Installing Node.js LTS with winget (you may be asked to accept its terms)...'
  winget install --id OpenJS.NodeJS.LTS -e
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $node = Get-Command node -ErrorAction Stop
}
$ver = (& node -v).TrimStart('v').Split('.')[0]
if ([int]$ver -lt 20) { throw "Node.js 20 or newer is required (found $(& node -v))." }
Write-Host "Node $(& node -v) at $($node.Source)"

Step 'Building the native Windows helper (uses the C# compiler built into Windows)'
& powershell -NoProfile -ExecutionPolicy Bypass -File "$root\native\build.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Native helper build failed' }

Step 'Installing companion dependencies'
Push-Location "$root\companion"; npm install --omit=dev --no-audit --no-fund; Pop-Location

if (-not (Test-Path "$root\dashboard\dist\index.html")) {
  Step 'Building the tablet dashboard'
  Push-Location "$root\dashboard"; npm install --no-audit --no-fund; npm run build; Pop-Location
} else { Write-Host 'Dashboard already built.' }

Step 'Creating launcher and Start menu shortcut'
$nodeExe = (Get-Command node).Source
$vbs = @"
' Starts the PadDeck companion without a console window.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$root\companion"
sh.Run """$nodeExe"" ""$root\companion\src\server.js""", 0, False
"@
Set-Content -Path "$root\PadDeck.vbs" -Value $vbs -Encoding ASCII
$lnkDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'PadDeck'
New-Item -ItemType Directory -Force $lnkDir | Out-Null
$ws = New-Object -ComObject WScript.Shell
$l = $ws.CreateShortcut("$lnkDir\PadDeck Companion.lnk"); $l.TargetPath = 'wscript.exe'; $l.Arguments = "`"$root\PadDeck.vbs`""; $l.WorkingDirectory = $root; $l.IconLocation = "$root\native\bin\PadDeckHelper.exe,0"; $l.Description = 'PadDeck - tablet companion for this PC'; $l.Save()
$l = $ws.CreateShortcut("$lnkDir\PadDeck Settings.lnk"); $l.TargetPath = 'http://localhost:47800/admin'; $l.Save()

if ($AutoStart) {
  Step 'Enabling start with Windows'
  reg.exe add 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' /v PadDeck /t REG_SZ /d "wscript.exe `"$root\PadDeck.vbs`"" /f | Out-Null
}

if (-not $NoLaunch) {
  Step 'Starting PadDeck'
  Start-Process wscript.exe -ArgumentList "`"$root\PadDeck.vbs`""
  Start-Sleep 4
  Start-Process 'http://localhost:47800/admin#pair'
}
Write-Host "`nDone. Your settings live in $env:APPDATA\PadDeck (never touched by updates)." -ForegroundColor Green
Write-Host 'If Windows Firewall asks about Node.js, allow it on Private networks so the tablet can connect.'
