!macro customInit
  ; Terminate any running FRIDAY instances or lingering uninstallers before file operations
  nsExec::Exec `taskkill /F /IM "FRIDAY.exe" /T`
  nsExec::Exec `taskkill /F /IM "Uninstall FRIDAY.exe" /T`
  Sleep 1000
!macroend

!macro customUnInit
  ; Terminate any running FRIDAY instances before uninstallation
  nsExec::Exec `taskkill /F /IM "FRIDAY.exe" /T`
  Sleep 500
!macroend
