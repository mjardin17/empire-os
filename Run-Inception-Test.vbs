' Autonomous Inception Test Runner
' Double-click this file to execute the test silently in the background

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Set working directory
strPath = "C:\Users\jjard\empire-os"

' Run the batch file silently (window style 0 = hidden, wait = false for async)
objShell.Run """" & strPath & "\start-test.bat""", 0, False

' Exit immediately
WScript.Quit
