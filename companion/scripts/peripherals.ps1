# Reports connected keyboards/mice and every device that exposes a battery level to Windows
# (Bluetooth LE Battery Service / Bluetooth hands-free battery via DEVPKEY_Bluetooth_Battery).
# Output: JSON. Never invents values - devices without a reported level are simply not in "battery".
$ErrorActionPreference = 'SilentlyContinue'
$BatteryKey = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$present = Get-PnpDevice -PresentOnly
$hid = @($present | Where-Object { $_.Class -in @('Keyboard','Mouse') -and $_.Status -eq 'OK' -and $_.InstanceId -like 'HID\*' -and $_.InstanceId -notlike 'HID\CONVERTEDDEVICE*' })

function Get-Addr($id) { if ($id -match '([0-9A-F]{12})(\\|_|&|$)') { return $Matches[1] } return $null }

$bt = @($present | Where-Object { $_.InstanceId -like 'BTHLE\DEV_*' -or $_.InstanceId -like 'BTHENUM\*' })
$battery = @()
if ($bt.Count) {
  $props = Get-PnpDeviceProperty -InstanceId ($bt.InstanceId) -KeyName $BatteryKey
  foreach ($p in $props) {
    if ($p.Data -eq $null -or $p.Type -eq 'Empty') { continue }
    $d = $bt | Where-Object { $_.InstanceId -eq $p.InstanceId } | Select-Object -First 1
    $addr = Get-Addr $d.InstanceId
    $kinds = @(); if ($addr) { foreach ($h in $hid) { if ($h.InstanceId -like "*$addr*") { $kinds += $h.Class } } }
    $battery += [pscustomobject]@{ name = ($d.FriendlyName -replace ' Hands-Free( AG)?$',''); instanceId = $d.InstanceId; address = $addr; battery = [int]$p.Data; kinds = @($kinds | Select-Object -Unique); bus = 'bluetooth' }
  }
}
$battery = @($battery | Group-Object { if ($_.address) { $_.address } else { $_.instanceId } } | ForEach-Object { $_.Group | Sort-Object { $_.kinds.Count } -Descending | Select-Object -First 1 })

$inputs = @()
if ($hid.Count) {
  $parents = @{}
  foreach ($p in (Get-PnpDeviceProperty -InstanceId ($hid.InstanceId) -KeyName 'DEVPKEY_Device_Parent')) { $parents[$p.InstanceId] = $p.Data }
  $pids = @($parents.Values | Where-Object { $_ } | Select-Object -Unique)
  $pnames = @{}
  if ($pids.Count) { foreach ($p in (Get-PnpDeviceProperty -InstanceId $pids -KeyName 'DEVPKEY_Device_BusReportedDeviceDesc')) { if ($p.Data) { $pnames[$p.InstanceId] = $p.Data } } }
  foreach ($h in $hid) {
    $addr = Get-Addr $h.InstanceId
    $bus = if ($h.InstanceId -like '*00001812-0000-1000-8000-00805F9B34FB*') { 'bluetooth' } elseif ($h.InstanceId -match 'VID_') { 'usb' } else { 'internal' }
    if ($bus -eq 'internal') { continue }
    $name = $h.FriendlyName
    $pn = $pnames[$parents[$h.InstanceId]]
    if ($pn -and $pn -notmatch '^(USB Input Device|HID-compliant|Bluetooth Low Energy GATT)') { $name = $pn }
    if ($bus -eq 'bluetooth' -and $addr) { $b = $battery | Where-Object { $_.address -eq $addr } | Select-Object -First 1; if ($b) { $name = $b.name } }
    $vidpid = if ($h.InstanceId -match 'VID[_&]0*([0-9A-F]{4})[&_]PID[_&]([0-9A-F]{4})') { "$($Matches[1]):$($Matches[2])" } else { $null }
    $inputs += [pscustomobject]@{ kind = $h.Class; name = $name; bus = $bus; address = $addr; vidpid = $vidpid; id = "$($h.Class)|$(if ($addr) { $addr } elseif ($vidpid) { $vidpid } else { $h.InstanceId })" }
  }
}
$inputs = @($inputs | Group-Object id | ForEach-Object { $_.Group[0] })
[pscustomobject]@{ battery = $battery; inputs = $inputs } | ConvertTo-Json -Depth 5 -Compress
