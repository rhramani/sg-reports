Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\sgreports\sg-reports"
WshShell.Run "cmd.exe /c start-project.bat", 0, False
