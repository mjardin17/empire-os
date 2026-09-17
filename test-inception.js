#!/usr/bin/env node
/**
 * Inception Labs Integration Test
 * Tests server startup, provider registration, and Inception endpoint
 */

import http from 'node:http'
import { spawn } from 'node:child_process'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const BASE_URL = 'http://localhost:3001'
const TIMEOUT = 30000 // 30 seconds

console.log('\n╔════════════════════════════════════════════════════════════╗')
console.log('║        INCEPTION LABS INTEGRATION TEST                      ║')
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
async function waitForServer(maxAttempts = 15) {
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
    await execAsync('netstat -ano | findstr :3001 | for /f "tokens=5" %a in (\'more\') do taskkill /PID %a /F 2>nul')
  } catch {
    try {
      // Try Unix/Mac
      await execAsync('lsof -ti:3001 | xargs kill -9 2>/dev/null || true')
    } catch {
      // Ignore if neither works
    }
  }
  await new Promise(r => setTimeout(r, 1000))
}

// Main
async function main() {
  try {
    // Step 1: Kill existing server
    console.log('[1] Checking for existing server on port 3001...')
    await killPort3001()
    console.log('    ✓ Port cleared\n')

    // Step 2: Start server
    console.log('[2] Starting Empire OS server...')
    const server = spawn('npx', ['pnpm@latest', '--filter', '@empire-os/server', 'start'], {
      cwd: process.cwd(),
      stdio: 'pipe',
    })

    server.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg.includes('[Empire OS]') || msg.includes('running')) {
        console.log(`    ${msg}`)
      }
    })

    // Step 3: Wait for health
    console.log('[3] Waiting for server to boot')
    process.stdout.write('    ')
    const healthy = await waitForServer()
    if (!healthy) {
      console.log('\n    ✗ Server failed to start')
      server.kill()
      process.exit(1)
    }
    console.log(' ✓ Server is ready\n')

    // Step 4: Check providers
    console.log('[4] Checking registered providers...')
    const providersRes = await httpRequest(`${BASE_URL}/providers`)
    const providers = Object.keys(providersRes.data.providers || {})
    console.log(`    Found: ${providers.join(', ')}`)
    const hasInception = providers.includes('inception')
    console.log(`    Inception: ${hasInception ? '✓ REGISTERED' : '✗ NOT FOUND'}\n`)

    // Step 5: Test Inception endpoint
    console.log('[5] Testing Inception endpoint...')
    const testPayload = {
      messages: [
        {
          role: 'user',
          content: 'Summarize in one sentence: Inception Labs provides cost-optimized AI for routine tasks.',
        },
      ],
      strategy: 'cost',
    }

    const testRes = await httpRequest(`${BASE_URL}/empire-assistant/ai/complete`, 'POST', testPayload)
    const result = testRes.data

    if (result.provider && result.model) {
      console.log(`    Provider: ${result.provider}`)
      console.log(`    Model: ${result.model}`)
      console.log(`    Cost: $${result.costPerMToken}/1M tokens`)
      console.log(`    Response: "${result.content}"\n`)

      if (result.provider === 'inception' && result.model === 'mercury-2.5') {
        console.log('╔════════════════════════════════════════════════════════════╗')
        console.log('║  ✅ SUCCESS — INCEPTION IS LIVE AND WORKING               ║')
        console.log('║  Ready to integrate into bosslister for 90% cost savings  ║')
        console.log('╚════════════════════════════════════════════════════════════╝\n')
      } else {
        console.log('⚠  Using fallback provider (not Inception)')
      }
    } else {
      console.log(`    ✗ Unexpected response: ${JSON.stringify(result)}\n`)
    }

    console.log(`Server running at: ${BASE_URL}`)
    console.log('Press Ctrl+C to stop.\n')

    // Keep server running
    await new Promise(() => {})
  } catch (err) {
    console.error('\n✗ Error:', err.message)
    process.exit(1)
  }
}

main()
