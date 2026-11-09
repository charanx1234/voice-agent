# FRIDAY - Windows Desktop & Start Menu Search Shortcut Installer
$exePath = "$env:LOCALAPPDATA\Programs\FRIDAY\FRIDAY.exe"
$workDir = "$env:LOCALAPPDATA\Programs\FRIDAY"
$iconPath = "$env:LOCALAPPDATA\Programs\FRIDAY\friday.ico"

if (!(Test-Path $exePath)) {
    Write-Error "Installed FRIDAY.exe not found at $exePath"
    exit 1
}

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
  $s.Arguments = ""
  $s.WorkingDirectory = $workDir
  $s.IconLocation = "$iconPath,0"
  $s.Description = "FRIDAY - Desktop AI Assistant"
  $s.Save()
  Write-Host "Created shortcut: $dest"
}

Write-Host "FRIDAY shortcut registered on Desktop and Start Menu as a native Windows application."
