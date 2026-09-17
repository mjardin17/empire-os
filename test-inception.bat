@echo off
cd C:\Users\jjard\empire-os

REM Kill any existing server on port 3001
echo [1] Stopping existing server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /PID %%a /F 2>nul
timeout /t 2 /nobreak

REM Start server
echo.
echo [2] Starting server...
start "Empire OS Server" npx pnpm@latest --filter @empire-os/server start
timeout /t 20 /nobreak

REM Test endpoint
echo.
echo [3] Testing Inception endpoint...
powershell -NoProfile -Command ^
  "$body = @{messages=@(@{role='user';content='Summarize: Inception Labs provides cost-optimized AI for routine tasks.'}); strategy='cost'} | ConvertTo-Json; " ^
  "$r = Invoke-WebRequest -Uri 'http://localhost:3001/empire-assistant/ai/complete' -Method Post -Body $body -Headers @{'Content-Type'='application/json'} -ErrorAction Stop; " ^
  "$j = $r.Content | ConvertFrom-Json; " ^
  "Write-Host 'Provider: ' $j.provider -ForegroundColor Cyan; " ^
  "Write-Host 'Model: ' $j.model -ForegroundColor Cyan; " ^
  "Write-Host 'Response: ' $j.content -ForegroundColor Green"

echo.
echo [DONE] Server is running at http://localhost:3001
echo Press any key to close this window...
pause >nul
