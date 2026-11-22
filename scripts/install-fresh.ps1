# install-fresh.ps1
$ErrorActionPreference = 'Continue'

Write-Host "=== Stopping any active FRIDAY or electron processes ==="
Get-Process | Where-Object { $_.ProcessName -like "*FRIDAY*" -or $_.ProcessName -like "*electron*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$targetDir = "$env:LOCALAPPDATA\Programs\FRIDAY"
Write-Host "Target installation folder: $targetDir"

if (Test-Path $targetDir) {
    Write-Host "Removing existing installation directory..."
    Remove-Item -Path $targetDir -Recurse -Force
    Start-Sleep -Seconds 1
}

if (-not (Test-Path $targetDir)) {
    Write-Host "Old installation completely removed."
} else {
    Write-Warning "Failed to delete some files in $targetDir"
}
