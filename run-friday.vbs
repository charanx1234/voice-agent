Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\25r11a6760\FRIDAY"
WshShell.Run "cmd.exe /c npx electron dist-electron/main/index.js", 0, False
