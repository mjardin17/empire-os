@echo off
cd C:\Users\jjard\empire-os
echo Building TypeScript...
pnpm build
if %ERRORLEVEL% EQU 0 (
  echo Build successful!
) else (
  echo Build failed with error code %ERRORLEVEL%
)
pause
