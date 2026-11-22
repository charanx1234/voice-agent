# deploy-installed-build.ps1
$ErrorActionPreference = 'Stop'

$sourceDir = "c:\25r11a6760\FRIDAY\dist-release\win-unpacked"
$targetDir = "$env:LOCALAPPDATA\Programs\FRIDAY"

Write-Host "Copying fresh win-unpacked build to $targetDir..."
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

Copy-Item -Path "$sourceDir\*" -Destination $targetDir -Recurse -Force
Write-Host "Files copied successfully."

# Copy icon
$icoSource = "c:\25r11a6760\FRIDAY\src\renderer\public\assets\friday.ico"
if (Test-Path $icoSource) {
    Copy-Item -Path $icoSource -Destination "$targetDir\friday.ico" -Force
}

# Ensure .env is copied to both app unpacked resources and roaming data
$envSource = "c:\25r11a6760\FRIDAY\.env"
$resourcesApp = "$targetDir\resources\app"
if (Test-Path $resourcesApp) {
    Copy-Item -Path $envSource -Destination "$resourcesApp\.env" -Force
}

$roamingApp = "$env:APPDATA\friday-ai-companion"
if (Test-Path $roamingApp) {
    Copy-Item -Path $envSource -Destination "$roamingApp\.env" -Force
}

# Create / Update Shortcuts
$wsh = New-Object -ComObject WScript.Shell

# Desktop Shortcut
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$desktopLnk = "$desktopPath\FRIDAY.lnk"
$sc1 = $wsh.CreateShortcut($desktopLnk)
$sc1.TargetPath = "$targetDir\FRIDAY.exe"
$sc1.WorkingDirectory = $targetDir
if (Test-Path "$targetDir\friday.ico") {
    $sc1.IconLocation = "$targetDir\friday.ico,0"
}
$sc1.Save()
Write-Host "Desktop shortcut created at: $desktopLnk"

# OneDrive Desktop shortcut if exists
$oneDriveDesktop = "$env:USERPROFILE\OneDrive\Desktop"
if (Test-Path $oneDriveDesktop) {
    $sc2 = $wsh.CreateShortcut("$oneDriveDesktop\FRIDAY.lnk")
    $sc2.TargetPath = "$targetDir\FRIDAY.exe"
    $sc2.WorkingDirectory = $targetDir
    if (Test-Path "$targetDir\friday.ico") {
        $sc2.IconLocation = "$targetDir\friday.ico,0"
    }
    $sc2.Save()
}

# Start Menu Shortcut
$startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FRIDAY"
if (-not (Test-Path $startMenuPath)) {
    New-Item -ItemType Directory -Path $startMenuPath -Force | Out-Null
}
$sc3 = $wsh.CreateShortcut("$startMenuPath\FRIDAY.lnk")
$sc3.TargetPath = "$targetDir\FRIDAY.exe"
$sc3.WorkingDirectory = $targetDir
if (Test-Path "$targetDir\friday.ico") {
    $sc3.IconLocation = "$targetDir\friday.ico,0"
}
$sc3.Save()
Write-Host "Start menu shortcut created."

$exeCheck = Get-Item "$targetDir\FRIDAY.exe"
Write-Host "Installed Executable:" $exeCheck.FullName
Write-Host "Executable Size:" $exeCheck.Length "bytes"
Write-Host "Last Write Time:" $exeCheck.LastWriteTime
