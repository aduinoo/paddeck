# Installed application discovery for PadDeck. Sources:
#   1. Start menu (Get-StartApps) - desktop apps, Microsoft Store apps, Steam games, Office
#   2. Installed programs in the registry (HKLM, HKLM WOW6432Node, HKCU Uninstall keys)
#   3. Desktop shortcuts (current user + public desktop)
# Output: JSON array of { name, appId?, path?, source }.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$out = New-Object System.Collections.Generic.List[object]

foreach ($a in Get-StartApps) {
  if ($a.AppID -match '^https?:') { continue }
  $out.Add([pscustomobject]@{ name = $a.Name; appId = $a.AppID; path = $null; source = 'start' })
}

$keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
foreach ($e in Get-ItemProperty $keys) {
  if (-not $e.DisplayName -or $e.SystemComponent -eq 1 -or $e.ParentKeyName) { continue }
  if ($e.DisplayName -match '(?i)(redistributable|runtime|update for|hotfix|driver|sdk|\bSDK\b|language pack|webview2)') { continue }
  $exe = $null
  if ($e.DisplayIcon) {
    $p = ($e.DisplayIcon -replace '"', '') -replace ',\s*-?\d+$', ''
    if ($p -match '(?i)\.exe$' -and $p -notmatch '(?i)(unins|uninst|setup|install)' -and (Test-Path $p)) { $exe = $p }
  }
  if (-not $exe -and $e.InstallLocation -and (Test-Path $e.InstallLocation)) {
    $cand = Get-ChildItem $e.InstallLocation -Filter *.exe -File | Where-Object { $_.Name -notmatch '(?i)(unins|uninst|setup|install|update|crash|helper|report)' } | Sort-Object Length -Descending | Select-Object -First 1
    if ($cand) { $exe = $cand.FullName }
  }
  if ($exe) { $out.Add([pscustomobject]@{ name = $e.DisplayName; appId = $null; path = $exe; source = 'registry' }) }
}

$desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'))
foreach ($d in $desktops) {
  foreach ($f in Get-ChildItem $d -File -Include *.lnk, *.url -Recurse -Depth 0) {
    $out.Add([pscustomobject]@{ name = [IO.Path]::GetFileNameWithoutExtension($f.Name); appId = $null; path = $f.FullName; source = 'desktop' })
  }
}
# 4. Common installation directories: <root>\<App>\<App>.exe (or the largest exe one level down)
$roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, (Join-Path $env:LOCALAPPDATA 'Programs')) | Where-Object { $_ -and (Test-Path $_) }
foreach ($root in $roots) {
  foreach ($dir in Get-ChildItem $root -Directory) {
    if ($dir.Name -match '(?i)^(common files|windows|microsoft|internet explorer|windowsapps|modifiablewindowsapps|reference assemblies|dotnet|msbuild|uninstall information|installshield)') { continue }
    $exe = Get-ChildItem $dir.FullName -Filter "$($dir.Name).exe" -File -Depth 1 | Select-Object -First 1
    if (-not $exe) { $exe = Get-ChildItem $dir.FullName -Filter *.exe -File | Where-Object { $_.Name -notmatch '(?i)(unins|setup|install|update|crash|helper|report|elevate|squirrel)' } | Sort-Object Length -Descending | Select-Object -First 1 }
    if ($exe) { $out.Add([pscustomobject]@{ name = $dir.Name; appId = $null; path = $exe.FullName; source = 'folder' }) }
  }
}
$out | ConvertTo-Json -Compress -Depth 3
