# FRIDAY - Windows Desktop & Start Menu Search Shortcut Installer
$exePath = "C:\25r11a6760\FRIDAY\node_modules\electron\dist\electron.exe"
$appPath = "dist-electron/main/index.js"
$workDir = "C:\25r11a6760\FRIDAY"
$iconPath = "C:\25r11a6760\FRIDAY\src\renderer\public\assets\friday.ico"

$destinations = @(
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FRIDAY.lnk",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FRIDAY\FRIDAY.lnk",
  "$([Environment]::GetFolderPath('Desktop'))\FRIDAY.lnk",
  "$env:USERPROFILE\Desktop\FRIDAY.lnk",
  "$env:USERPROFILE\OneDrive\Desktop\FRIDAY.lnk"
) | Select-Object -Unique

$wsh = New-Object -ComObject WScript.Shell

foreach ($dest in $destinations) {
  $dir = Split-Path -Path $dest -Parent
  if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $s = $wsh.CreateShortcut($dest)
  $s.TargetPath = $exePath
  $s.Arguments = $appPath
  $s.WorkingDirectory = $workDir
  $s.IconLocation = "$iconPath,0"
  $s.Description = "FRIDAY - Multilingual AI Companion"
  $s.Save()
  Write-Host "Created shortcut: $dest"
}

Write-Host "FRIDAY is now accessible on your Desktop and in Windows Search!"
