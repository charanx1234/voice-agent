# FRIDAY - Windows Desktop & Start Menu Search Shortcut Installer
$packagedExe = "C:\25r11a6760\FRIDAY\dist-release\win-unpacked\FRIDAY.exe"
$workDir = "C:\25r11a6760\FRIDAY"
$iconPath = "C:\25r11a6760\FRIDAY\src\renderer\public\assets\friday.ico"

if (Test-Path $packagedExe) {
    $exePath = $packagedExe
    $arguments = "--dashboard"
} else {
    $exePath = "C:\25r11a6760\FRIDAY\node_modules\electron\dist\electron.exe"
    $arguments = ". --dashboard"
}

$destinations = @(
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FRIDAY.lnk",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FRIDAY\FRIDAY.lnk",
  "$([Environment]::GetFolderPath('Desktop'))\FRIDAY.lnk",
  "$env:USERPROFILE\Desktop\FRIDAY.lnk"
) | Select-Object -Unique

$wsh = New-Object -ComObject WScript.Shell

foreach ($dest in $destinations) {
  $dir = Split-Path -Path $dest -Parent
  if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $s = $wsh.CreateShortcut($dest)
  $s.TargetPath = $exePath
  $s.Arguments = $arguments
  $s.WorkingDirectory = $workDir
  if (Test-Path $iconPath) {
    $s.IconLocation = "$iconPath,0"
  }
  $s.Description = "FRIDAY AI Assistant"
  $s.Save()
  Write-Host "Created shortcut: $dest"
}

Write-Host "FRIDAY shortcut successfully registered on Desktop and Start Menu Search."
