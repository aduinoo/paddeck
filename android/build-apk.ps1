# Builds PadDeck.apk without Android Studio. Downloads (≈ 600 MB, once) into android\.tools:
#   Microsoft Build of OpenJDK 17, Android command-line tools, Gradle 8.10.2,
#   then installs Android platform 35 + build-tools with sdkmanager.
# You will be asked to review and accept the Android SDK licence - that is your decision.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path $here '.tools'; New-Item -ItemType Directory -Force $tools | Out-Null
function Fetch($url, $zip, $dest) {
  if (Test-Path $dest) { return }
  $file = Join-Path $tools $zip
  Write-Host "Downloading $url"
  Invoke-WebRequest $url -OutFile $file -UseBasicParsing
  Expand-Archive $file -DestinationPath $dest -Force
  Remove-Item $file
}
Fetch 'https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip' 'jdk.zip' "$tools\jdk"
Fetch 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' 'clt.zip' "$tools\clt"
Fetch 'https://services.gradle.org/distributions/gradle-8.10.2-bin.zip' 'gradle.zip' "$tools\gradle"

$env:JAVA_HOME = (Get-ChildItem "$tools\jdk" -Directory | Select-Object -First 1).FullName
$sdk = "$tools\sdk"
$env:ANDROID_HOME = $sdk; $env:ANDROID_SDK_ROOT = $sdk
$cmdline = "$sdk\cmdline-tools\latest"
if (-not (Test-Path $cmdline)) { New-Item -ItemType Directory -Force (Split-Path $cmdline) | Out-Null; Copy-Item "$tools\clt\cmdline-tools" $cmdline -Recurse }
$sdkmanager = "$cmdline\bin\sdkmanager.bat"
Write-Host "`nReview the Android SDK licence terms below and answer y to accept them." -ForegroundColor Yellow
& $sdkmanager --licenses
& $sdkmanager 'platforms;android-35' 'build-tools;35.0.0' 'platform-tools'

Set-Content "$here\local.properties" "sdk.dir=$($sdk -replace '\\','\\')"
$gradle = (Get-ChildItem "$tools\gradle" -Directory | Select-Object -First 1).FullName + '\bin\gradle.bat'
Push-Location $here
& $gradle --no-daemon assembleRelease
Pop-Location
$apk = Get-ChildItem "$here\app\build\outputs\apk\release\*.apk" | Select-Object -First 1
Copy-Item $apk.FullName "$here\..\PadDeck.apk" -Force
Write-Host "`nBuilt PadDeck.apk next to install.ps1." -ForegroundColor Green
Write-Host 'Install: copy it to the tablet and open it (allow "Install unknown apps" for your file manager),'
Write-Host "or with USB debugging on: $sdk\platform-tools\adb.exe install -r PadDeck.apk"
