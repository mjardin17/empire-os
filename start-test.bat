@echo off
REM Quick launcher to run the autonomous test
cd /d C:\Users\jjard\empire-os
powershell -NoProfile -ExecutionPolicy Bypass -File execute-test-silent.ps1
