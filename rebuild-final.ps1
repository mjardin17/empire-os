cd C:\Users\jjard\empire-os

Write-Host "Running TypeScript build..." -ForegroundColor Cyan

# Use node_modules/.bin or pnpm directly
& ".\node_modules\.bin\pnpm.cmd" build 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "BUILD FAILED - check errors above" -ForegroundColor Red
    exit 1
}
