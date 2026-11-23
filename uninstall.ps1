# Removes PadDeck shortcuts and autostart. Your settings in %APPDATA%\PadDeck are kept
# unless you pass -RemoveData.
param([switch]$RemoveData)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*companion*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-Process PadDeckHelper -ErrorAction SilentlyContinue | Stop-Process -Force
reg.exe delete 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' /v PadDeck /f 2>$null | Out-Null
Remove-Item -Recurse -Force (Join-Path ([Environment]::GetFolderPath('Programs')) 'PadDeck') -ErrorAction SilentlyContinue
if ($RemoveData) { Remove-Item -Recurse -Force "$env:APPDATA\PadDeck" -ErrorAction SilentlyContinue }
Write-Host 'PadDeck removed.'
