# Compiles PadDeckHelper.exe with the C# compiler that ships with Windows (.NET Framework 4.8).
# No Visual Studio or .NET SDK required.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$wm = "$env:WINDIR\System32\WinMetadata"
$out = Join-Path $here 'bin'
New-Item -ItemType Directory -Force $out | Out-Null
$refs = @(
  "$fw\System.Web.Extensions.dll", "$fw\System.Windows.Forms.dll", "$fw\System.Drawing.dll",
  "$fw\WPF\PresentationCore.dll", "$fw\WPF\WindowsBase.dll", "$fw\System.Xaml.dll", "$fw\System.Runtime.dll",
  "$wm\Windows.Media.winmd", "$wm\Windows.Foundation.winmd", "$wm\Windows.Storage.winmd"
) | ForEach-Object { "-r:$_" }
$src = Get-ChildItem $here -Filter *.cs | ForEach-Object { $_.FullName }
& "$fw\csc.exe" -nologo -optimize+ -platform:x64 -target:winexe "-win32manifest:$here\app.manifest" "-out:$out\PadDeckHelper.exe" @refs @src
if ($LASTEXITCODE -ne 0) { throw "Helper build failed" }
Write-Host "Built $out\PadDeckHelper.exe"
