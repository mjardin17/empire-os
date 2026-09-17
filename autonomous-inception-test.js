#!/usr/bin/env node
/**
 * Autonomous Inception Integration Test
 * Restarts server, verifies Inception is registered, and tests the endpoint
 * Designed to run completely autonomously without user intervention
 */

import http from 'node:http'
import { spawn } from 'node:child_process'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const BASE_URL = 'http://localhost:3001'
const TIMEOUT = 30000

console.log('\n╔════════════════════════════════════════════════════════════╗')
console.log('║      AUTONOMOUS INCEPTION VERIFICATION                     ║')
console.log('║      (No user interaction required)                        ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

// Helper: Make HTTP request
function httpRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      timeout: 10000,
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// Helper: Wait for server
async function waitForServer(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await httpRequest(`${BASE_URL}/health`)
      return true
    } catch {
      if (i < maxAttempts - 1) {
        process.stdout.write('.')
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }
  return false
}

// Helper: Kill process on port 3001
async function killPort3001() {
  try {
    // Try Windows first
    await execAsync('powershell -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"')
  } catch {
    try {
      // Try Unix/Mac
      await execAsync('lsof -ti:3001 | xargs kill -9 2>/dev/null || true')
    } catch {
      // Ignore if neither works
    }
  }
  await new Promise(r => setTimeout(r, 1500))
}

// Main autonomous test
async function main() {
  try {
    // Step 1: Kill existing server
    console.log('[1] Clearing port 3001...')
    await killPort3001()
    console.log('    ✓ Port cleared\n')

    // Step 2: Start server
    console.log('[2] Starting Empire OS server...')
    const server = spawn('npx', ['pnpm@latest', '--filter', '@empire-os/server', 'start'], {
      cwd: 'C:\\Users\\jjard\\empire-os',
      stdio: 'pipe',
    })

    let serverStartOutput = ''
    server.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      serverStartOutput += msg + '\n'
      if (msg.includes('[Empire OS]') || msg.includes('running') || msg.includes('adapter registered')) {
        console.log(`    ${msg}`)
      }
    })

    // Step 3: Wait for health
    console.log('[3] Waiting for server boot')
    process.stdout.write('    ')
    const healthy = await waitForServer(20)
    if (!healthy) {
      console.log('\n    ✗ Server failed to start')
      console.log('\n    Server output:')
      console.log(serverStartOutput)
      server.kill()
      process.exit(1)
    }
    console.log(' ✓ Server is ready\n')

    // Step 4: Call the test endpoint
    console.log('[4] Testing Inception via /test-inception endpoint...')
    const testRes = await httpRequest(`${BASE_URL}/test-inception`, 'POST', {})
    const result = testRes.data

    if (result.status === 'success') {
      console.log(`    Status: ${result.status}`)
      console.log(`    Inception Registered: ${result.inception_registered ? '✅ YES' : '❌ NO'}\n`)

      if (result.test_result) {
        const tr = result.test_result
        console.log('    Providers available:', (tr.providers_available || []).join(', '))

        if (result.inception_registered && tr.inception_models) {
          console.log(`    Inception models found: ${tr.inception_models.length}`)
          tr.inception_models.forEach((m) => {
            console.log(`      • ${m.id} — $${m.costPerMToken}/1M tokens`)
          })
        }

        if (tr.endpoint_test) {
          console.log(`\n    Endpoint test: ${tr.endpoint_test.success ? '✅ SUCCESS' : '❌ FAILED'}`)
          if (tr.endpoint_test.success) {
            console.log(`      Provider: ${tr.endpoint_test.provider}`)
            console.log(`      Model: ${tr.endpoint_test.model}`)
            console.log(`      Cost: $${tr.endpoint_test.costPerMToken}/1M tokens`)
            console.log(`      Response: "${tr.endpoint_test.content}"`)
          }
        }
      }

      // Final verdict
      console.log('\n╔════════════════════════════════════════════════════════════╗')
      if (result.inception_registered && result.test_result?.endpoint_test?.success) {
        console.log('║  ✅ SUCCESS — INCEPTION IS LIVE AND WORKING                ║')
        console.log('║  Ready to integrate into bosslister for 90% cost savings   ║')
      } else if (result.inception_registered) {
        console.log('║  ⚠️  INCEPTION REGISTERED BUT ENDPOINT TEST INCOMPLETE     ║')
      } else {
        console.log('║  ❌ INCEPTION NOT REGISTERED                               ║')
        console.log('║  Check: .env file has INCEPTION_API_KEY set                ║')
      }
      console.log('╚════════════════════════════════════════════════════════════╝\n')
    } else {
      console.log(`    ✗ Endpoint error: ${result.error}\n`)
    }

    console.log(`Server running at: ${BASE_URL}`)
    console.log('Monitoring... Press Ctrl+C to stop.\n')

    // Keep server running
    await new Promise(() => {})
  } catch (err) {
    console.error('\n✗ Autonomous test failed:', err.message)
    process.exit(1)
  }
}

main()
