cd C:\Users\jjard\empire-os

# Try to find pnpm
$pnpmPath = (Get-Command pnpm -ErrorAction SilentlyContinue).Path
if (-not $pnpmPath) {
    # Try npm instead
    Write-Host "pnpm not found, trying npm..." -ForegroundColor Yellow
    npm run build
} else {
    Write-Host "Running pnpm build..." -ForegroundColor Cyan
    pnpm build
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
} else {
    Write-Host "BUILD FAILED - check errors above" -ForegroundColor Red
}

Read-Host "Press Enter to exit"
