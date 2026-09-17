# Silent Autonomous Inception Test Executor
# This script runs completely in the background without showing output

$ErrorActionPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'

# Kill any existing server
Write-Host "Clearing port 3001..."
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 1500

# Change to project directory
cd C:\Users\jjard\empire-os

# Run the test and capture output to log file
Write-Host "Running autonomous Inception test..."
Write-Host "Test results will be saved to: C:\Users\jjard\empire-os\test-results.log"
Write-Host ""

# Execute in background and log output
Start-Job -ScriptBlock {
  cd C:\Users\jjard\empire-os
  node autonomous-inception-test.js 2>&1 | Out-File -FilePath "test-results.log" -Encoding UTF8
} | Wait-Job | Remove-Job

# Check if test completed successfully
if (Test-Path "test-results.log") {
  Write-Host "✓ Test completed. Results saved to test-results.log"
  Write-Host ""
  Write-Host "Last 20 lines of output:"
  Write-Host "─────────────────────────────────────"
  Get-Content "test-results.log" -Tail 20
} else {
  Write-Host "✗ Test did not produce output file"
}
