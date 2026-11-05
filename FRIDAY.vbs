Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\25r11a6760\FRIDAY"
WshShell.Run """C:\25r11a6760\FRIDAY\node_modules\electron\dist\electron.exe"" ""C:\25r11a6760\FRIDAY\dist-electron\main\index.js""", 0, False
