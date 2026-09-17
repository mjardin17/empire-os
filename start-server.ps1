# Start Empire OS Server with health endpoint test
Set-Location "C:\Users\jjard\empire-os"

Write-Host "🚀 Starting Empire OS Server..." -ForegroundColor Cyan
Write-Host "Using: npx tsx apps/empire-os-server/server.ts`n" -ForegroundColor Gray

# Start server in background
$serverProcess = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c npx tsx apps/empire-os-server/server.ts" `
  -NoNewWindow `
  -PassThru

Write-Host "⏳ Waiting 5 seconds for server startup..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "`n🔍 Testing /apex/health endpoint...`n" -ForegroundColor Cyan
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3000/apex/health" -ErrorAction Stop
  Write-Host "✅ HEALTHY - Server responding" -ForegroundColor Green
  Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
  Write-Host "Response:`n$($response.Content)" -ForegroundColor Green
} catch {
  Write-Host "❌ OFFLINE - Server not responding" -ForegroundColor Red
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "`nServer may still be starting. Check manually:`ncurl http://localhost:3000/apex/health" -ForegroundColor Yellow
}

Write-Host "`n📊 Server Process ID: $($serverProcess.Id)" -ForegroundColor Gray
Write-Host "To stop server: Stop-Process -Id $($serverProcess.Id) -Force" -ForegroundColor Gray
