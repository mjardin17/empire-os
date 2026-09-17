@echo off
echo Cleaning up node_modules...
cd C:\Users\jjard\empire-os\packages\core
if exist node_modules (
  echo Removing core/node_modules...
  rmdir /s /q node_modules
  echo Done.
)

cd C:\Users\jjard\empire-os\packages\database
if exist node_modules (
  echo Removing database/node_modules...
  rmdir /s /q node_modules
  echo Done.
)

cd C:\Users\jjard\video-bot-pipeline
if exist node_modules (
  echo Removing video-bot-pipeline/node_modules...
  rmdir /s /q node_modules
  echo Done.
)

echo Cleanup complete. You can now run: pnpm install && pnpm build
pause
