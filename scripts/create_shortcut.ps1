$shell = New-Object -ComObject WScript.Shell
$desktopPaths = @(
    [Environment]::GetFolderPath('Desktop'),
    'C:\Users\RAM CHARAN\Desktop',
    'C:\Users\RAM CHARAN\OneDrive\Desktop'
) | Select-Object -Unique | Where-Object { Test-Path $_ }

$targetExe = 'C:\25r11a6760\FRIDAY\FRIDAY.exe'
$workDir = 'C:\25r11a6760\FRIDAY'
$iconPath = 'C:\25r11a6760\FRIDAY\src\renderer\public\assets\friday.ico'

foreach ($dp in $desktopPaths) {
    $lnkPath = Join-Path $dp 'FRIDAY.lnk'
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = $targetExe
    $shortcut.WorkingDirectory = $workDir
    $shortcut.Description = 'FRIDAY - AI Voice Companion & Desktop Assistant'
    if (Test-Path $iconPath) {
        $shortcut.IconLocation = "$iconPath,0"
    } else {
        $shortcut.IconLocation = "$targetExe,0"
    }
    $shortcut.Save()

    # Verify
    $verify = $shell.CreateShortcut($lnkPath)
    Write-Host "Created shortcut: $($verify.FullName)"
    Write-Host "  Target: $($verify.TargetPath)"
    Write-Host "  WorkingDir: $($verify.WorkingDirectory)"
    Write-Host "  IconLocation: $($verify.IconLocation)"
    Write-Host "  Target Exists: $(Test-Path $verify.TargetPath)"
}
