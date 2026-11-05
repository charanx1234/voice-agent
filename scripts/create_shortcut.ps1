$shell = New-Object -ComObject WScript.Shell
$desktopPaths = @(
    [Environment]::GetFolderPath('Desktop'),
    'C:\Users\RAM CHARAN\Desktop',
    'C:\Users\RAM CHARAN\OneDrive\Desktop'
) | Select-Object -Unique | Where-Object { Test-Path $_ }

$targetExe = 'C:\25r11a6760\FRIDAY\dist-release\win-unpacked\FRIDAY.exe'
$workDir = 'C:\25r11a6760\FRIDAY\dist-release\win-unpacked'

foreach ($dp in $desktopPaths) {
    $lnkPath = Join-Path $dp 'FRIDAY.lnk'
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = $targetExe
    $shortcut.WorkingDirectory = $workDir
    $shortcut.Description = 'FRIDAY - AI Voice Companion & Desktop Assistant'
    $shortcut.IconLocation = "$targetExe,0"
    $shortcut.Save()

    # Verify
    $verify = $shell.CreateShortcut($lnkPath)
    Write-Host "Shortcut at: $($verify.FullName)"
    Write-Host "Target: $($verify.TargetPath)"
    Write-Host "WorkingDir: $($verify.WorkingDirectory)"
    Write-Host "TargetExists: $(Test-Path $verify.TargetPath)"
    Write-Host "----------------------------------------"
}
