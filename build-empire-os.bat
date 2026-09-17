@echo off
cd /d C:\Users\jjard\empire-os
echo Clearing cache...
if exist dist rmdir /s /q dist
if exist node_modules\.cache rmdir /s /q node_modules\.cache
echo Running pnpm build...
pnpm build
echo.
echo Build complete! Check output above for errors.
pause
