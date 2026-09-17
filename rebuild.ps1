cd C:\Users\jjard\empire-os
Write-Host "Running pnpm build..." -ForegroundColor Cyan
pnpm build

if ($LASTEXITCODE -eq 0) {
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
} else {
    Write-Host "BUILD FAILED - check errors above" -ForegroundColor Red
}

Read-Host "Press Enter to exit"
