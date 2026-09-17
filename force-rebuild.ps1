# Run as Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]'Administrator')) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process PowerShell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"& '$PSCommandPath'`"" -Verb RunAs
    exit
}

cd C:\Users\jjard\empire-os

Write-Host "Force removing node_modules..." -ForegroundColor Cyan
Remove-Item -Recurse -Force packages\core\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue

Write-Host "Running build..." -ForegroundColor Cyan
npx pnpm build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBUILD SUCCESSFUL!" -ForegroundColor Green
} else {
    Write-Host "`nBUILD FAILED" -ForegroundColor Red
}

Read-Host "Press Enter to exit"
