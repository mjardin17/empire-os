/**
 * GooseExecutor — delegates local development tasks to the Goose AI agent CLI.
 *
 * Goose (by Block) performs local tool executions: edits files, runs shell
 * commands, monitors directories, and executes scripts. Empire OS uses it
 * for local dev work that shouldn't consume cloud AI tokens.
 *
 * DISCOVERY ORDER (first match wins):
 *   1. GOOSE_BIN env var (set this in .env to pin permanently)
 *   2. %USERPROFILE%\.local\bin\goose.exe  (Block installer default on Windows)
 *   3. %LOCALAPPDATA%\Programs\goose\goose.exe
 *   4. %LOCALAPPDATA%\goose\goose.exe
 *   5. %USERPROFILE%\scoop\apps\goose\current\goose.exe
 *   6. %USERPROFILE%\.cargo\bin\goose.exe
 *   7. goose  (raw PATH lookup — works if goose dir is in system PATH)
 *
 * EMPIRE OS ROUTING:
 *   POST /goose/run  { "task": "..." }  →  runs via `goose run --text "..."`
 *   GET  /providers                     →  shows goose.available + version
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export interface GooseTaskResult {
  output:     string
  exitCode:   number
  durationMs: number
  executor:   'goose'
}

// Build the candidate list dynamically using env vars — no hardcoded usernames
function buildCandidates(): string[] {
  const home  = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')

  const candidates: string[] = []

  // Highest priority: explicit override from .env
  if (process.env.GOOSE_BIN) {
    candidates.push(process.env.GOOSE_BIN)
  }

  if (home) {
    // Block's official Windows installer drops here
    candidates.push(path.join(home, '.local', 'bin', 'goose.exe'))
    // Scoop
    candidates.push(path.join(home, 'scoop', 'apps', 'goose', 'current', 'goose.exe'))
    // Cargo (Rust build)
    candidates.push(path.join(home, '.cargo', 'bin', 'goose.exe'))
  }

  if (local) {
    candidates.push(path.join(local, 'Programs', 'goose', 'goose.exe'))
    candidates.push(path.join(local, 'goose', 'goose.exe'))
  }

  // Raw PATH lookup — last resort
  candidates.push('goose')

  return candidates
}

export class GooseExecutor {
  readonly available: boolean
  readonly gooseBin:  string    // exposed so server can log exact path
  readonly version:   string

  private constructor(available: boolean, gooseBin: string, version: string) {
    this.available = available
    this.gooseBin  = gooseBin
    this.version   = version
  }

  /**
   * Detects Goose — tries every candidate path, returns on first working one.
   * Never throws: if nothing is found, executor.available === false.
   */
  static async create(): Promise<GooseExecutor> {
    const candidates = buildCandidates()

    for (const bin of candidates) {
      try {
        const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 5_000 })
        const ver = stdout.trim() || '(version unknown)'
        return new GooseExecutor(true, bin, ver)
      } catch {
        // not at this path — try next
      }
    }

    return new GooseExecutor(false, 'goose', '')
  }

  /**
   * Run a one-shot task via `goose run --text "..."`.
   * Returns full stdout. Times out after timeoutMs (default 5 min).
   */
  async run(task: string, timeoutMs = 300_000): Promise<GooseTaskResult> {
    if (!this.available) {
      throw new Error(
        '[GooseExecutor] Goose not found. Run FIND_AND_FIX_GOOSE.bat, ' +
        'then add GOOSE_BIN=<path> to your .env and restart Empire OS.'
      )
    }

    const start = Date.now()
    try {
      const { stdout, stderr } = await execFileAsync(
        this.gooseBin,
        ['run', '--text', task],
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      )
      return {
        output:     stdout || stderr || '(no output)',
        exitCode:   0,
        durationMs: Date.now() - start,
        executor:   'goose',
      }
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string; message?: string }
      return {
        output:     e.stderr ?? e.stdout ?? e.message ?? 'Goose task failed',
        exitCode:   e.code ?? 1,
        durationMs: Date.now() - start,
        executor:   'goose',
      }
    }
  }
}
