@echo off
cd C:\Users\jjard\empire-os

echo Cleaning up node_modules...
rmdir /s /q node_modules 2>nul
rmdir /s /q packages\core\node_modules 2>nul
rmdir /s /q packages\database\node_modules 2>nul

echo Clearing caches...
rmdir /s /q %APPDATA%\Local\pnpm-cache 2>nul
rmdir /s /q %APPDATA%\Local\npm-cache 2>nul
rmdir /s /q %APPDATA%\Roaming\npm-cache 2>nul
rmdir /s /q %TEMP% 2>nul
mkdir %TEMP%

echo Installing dependencies...
call pnpm install

echo Building TypeScript...
call pnpm build

pause
