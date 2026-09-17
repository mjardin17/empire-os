REM Autonomous Inception Test - Silent Background Runner
REM This executes Node.js without showing any terminal window

Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd /c cd C:\Users\jjard\empire-os && node autonomous-inception-test.js > autonomous-test-results.log 2>&1", 0, False
