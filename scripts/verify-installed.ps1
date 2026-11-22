# verify-installed.ps1
$installPath = "$env:LOCALAPPDATA\Programs\FRIDAY"
Write-Host "Verifying install directory: $installPath"

$exe = Get-Item "$installPath\FRIDAY.exe"
Write-Host "Executable:" $exe.FullName "($($exe.Length) bytes, LastWrite: $($exe.LastWriteTime))"

$files = @(
    "$installPath\resources\app\dist-electron\main\voiceCoordinator.js",
    "$installPath\resources\app\dist-electron\services\voice\requestController.js",
    "$installPath\resources\app\dist-electron\services\voice\noiseSuppressor.js",
    "$installPath\resources\app\dist-electron\services\voice\echoCanceller.js",
    "$installPath\resources\app\dist-electron\services\voice\turnDetector.js",
    "$installPath\resources\app\dist-electron\services\voice\neuralVoice.js",
    "$installPath\resources\app\.env",
    "$env:APPDATA\friday-ai-companion\.env"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "[OK] Found: $f"
    } else {
        Write-Host "[MISSING] $f"
    }
}

# Check shortcuts
$shortcuts = @(
    "$([System.Environment]::GetFolderPath('Desktop'))\FRIDAY.lnk",
    "$env:USERPROFILE\OneDrive\Desktop\FRIDAY.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FRIDAY\FRIDAY.lnk"
)

foreach ($s in $shortcuts) {
    if (Test-Path $s) {
        Write-Host "[OK] Shortcut exists: $s"
    }
}
