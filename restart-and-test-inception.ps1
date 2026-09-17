# Restart Empire OS Server with fixed dotenv loading and test Inception

$ProjectRoot = "C:\Users\jjard\empire-os"
$ServerUrl = "http://localhost:3001/empire-assistant/ai/complete"

Write-Host "=== Empire OS Server Restart & Inception Test ===" -ForegroundColor Cyan

# Kill any existing server on port 3001
Write-Host "`n[1] Stopping existing server..." -ForegroundColor Yellow
$process = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($process) {
    Stop-Process -Id $process.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "✓ Killed process on port 3001" -ForegroundColor Green
} else {
    Write-Host "✓ Port 3001 already free" -ForegroundColor Green
}

# Start server
Write-Host "`n[2] Starting server..." -ForegroundColor Yellow
cd $ProjectRoot
$serverProcess = Start-Process -FilePath "npx" -ArgumentList "pnpm@latest","--filter","@empire-os/server","start" -PassThru -NoNewWindow
Write-Host "✓ Server starting (PID: $($serverProcess.Id))" -ForegroundColor Green
Start-Sleep -Seconds 20

# Wait for server health
Write-Host "`n[3] Waiting for server health..." -ForegroundColor Yellow
$healthy = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $health = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "✓ Server is responding" -ForegroundColor Green
        $healthy = $true
        break
    } catch {
        Write-Host "  Attempt $($i+1)/10... still starting" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if (-not $healthy) {
    Write-Host "✗ Server failed to start" -ForegroundColor Red
    exit 1
}

# Check providers — THIS SHOULD SHOW INCEPTION NOW
Write-Host "`n[4] Checking providers..." -ForegroundColor Yellow
try {
    $providers = Invoke-WebRequest -Uri "http://localhost:3001/providers" -TimeoutSec 5 -ErrorAction Stop
    $data = $providers.Content | ConvertFrom-Json

    Write-Host "✓ Providers available:" -ForegroundColor Green
    foreach ($provider in $data.providers.PSObject.Properties) {
        Write-Host "    - $($provider.Name)" -ForegroundColor Cyan
    }

    if ($data.providers.inception) {
        Write-Host "`n✅ SUCCESS — Inception is registered!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠  Inception NOT in provider list" -ForegroundColor Yellow
        Write-Host "   Expected: inception" -ForegroundColor Yellow
        Write-Host "   Got: $($data.providers.PSObject.Properties.Name -join ', ')" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Failed to check providers: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test Inception endpoint
Write-Host "`n[5] Testing Inception endpoint..." -ForegroundColor Yellow
$testRequest = @{
    messages = @(
        @{
            role = "user"
            content = "Summarize in one sentence: Inception Labs provides cost-optimized AI for routine tasks."
        }
    )
    strategy = "cost"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $ServerUrl `
        -Method Post `
        -Headers @{"Content-Type" = "application/json"} `
        -Body $testRequest `
        -TimeoutSec 15 `
        -ErrorAction Stop

    $result = $response.Content | ConvertFrom-Json

    Write-Host "✓ Endpoint responded" -ForegroundColor Green
    Write-Host "  Provider: $($result.provider)" -ForegroundColor Cyan
    Write-Host "  Model: $($result.model)" -ForegroundColor Cyan
    Write-Host "  Cost: `$$($result.costPerMToken)/1M tokens" -ForegroundColor Cyan
    Write-Host "  Response: `"$($result.content)`"" -ForegroundColor Gray

    if ($result.provider -eq "inception" -and $result.model -eq "mercury-2.5") {
        Write-Host "`n✅ INCEPTION IS LIVE AND WORKING" -ForegroundColor Green
        Write-Host "   Ready to integrate into bosslister!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠  Provider is $($result.provider) — fallback model" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Endpoint test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Green
Write-Host "Server running at: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Keep this terminal open. Press Ctrl+C to stop server." -ForegroundColor Yellow
