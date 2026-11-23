# Second-monitor setup: installs Apollo (open-source Sunshine fork, GPL-3.0) which includes the
# signed SudoVDA virtual display driver. Windows then gets a real extra monitor whenever the
# tablet connects with Artemis/Moonlight.
#
# AUTHORISATION REQUIRED: installing a display driver and a Windows service needs administrator
# rights. The Apollo installer shows the Windows UAC prompt - you decide whether to allow it.
$ErrorActionPreference = 'Stop'
$installed = Test-Path "$env:ProgramFiles\Apollo\sunshine.exe"
if ($installed) { Write-Host 'Apollo is already installed.' -ForegroundColor Green }
else {
  Write-Host 'Looking up the latest Apollo release on GitHub (ClassicOldSong/Apollo)...'
  $rel = Invoke-RestMethod 'https://api.github.com/repos/ClassicOldSong/Apollo/releases/latest' -Headers @{ 'User-Agent' = 'PadDeck-setup' }
  $asset = $rel.assets | Where-Object { $_.name -match '\.exe$' } | Select-Object -First 1
  if (-not $asset) { throw 'No Windows installer found in the latest Apollo release. Download it manually from https://github.com/ClassicOldSong/Apollo/releases' }
  $dir = Join-Path $env:TEMP "paddeck-apollo-$($rel.tag_name)"
  New-Item -ItemType Directory -Force $dir | Out-Null
  $exe = Join-Path $dir $asset.name
  Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB, release $($rel.tag_name))..."
  Invoke-WebRequest $asset.browser_download_url -OutFile $exe -UseBasicParsing
  $sig = Get-AuthenticodeSignature $exe
  Write-Host "Installer signature: $($sig.Status) $($sig.SignerCertificate.Subject)"
  Write-Host 'Starting the Apollo installer - approve the Windows prompt to continue.' -ForegroundColor Yellow
  Start-Process $exe -Wait
}
Write-Host @"

Next steps
  1. Open https://localhost:47990 on this PC (Apollo web UI) and create a username/password.
     Your browser will warn about the self-signed certificate - that is expected for a local service.
  2. On the Xiaomi Pad 5 install Artemis (https://github.com/ClassicOldSong/moonlight-android/releases)
     or Moonlight from the Play Store.
  3. In Artemis tap +, enter this PC's IP address, then type the PIN it shows into Apollo's web UI (PIN tab).
  4. Start "Desktop". Apollo creates a virtual monitor sized to the tablet. Arrange it in
     Windows Settings > System > Display like any other monitor (Extend these displays).
"@ -ForegroundColor Cyan
