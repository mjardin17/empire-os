cd C:\Users\jjard\empire-os

Write-Host "Running build with npx..." -ForegroundColor Cyan

# Clear npm cache in case there are lock issues
npx pnpm build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBUILD SUCCESSFUL!" -ForegroundColor Green
} else {
    Write-Host "`nBUILD FAILED - trying alternative..." -ForegroundColor Yellow
    # If npx pnpm fails, try npm scripts directly
    npm run build
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
} else {
    Write-Host "BUILD FAILED - check errors above" -ForegroundColor Red
}

Read-Host "Press Enter to exit"
