import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { ScreenBounds } from './validation.js'

const execFileAsync = promisify(execFile)
const driverPath = fileURLToPath(new URL('../scripts/windows-driver.ps1', import.meta.url))

export interface ScreenshotResult {
  pngBase64: string
  width: number
  height: number
}

export async function invokeWindows<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (process.platform !== 'win32') throw new Error('dsh-computer-use currently supports Windows only')
  const encoded = Buffer.from(JSON.stringify({ action, ...payload }), 'utf8').toString('base64')
  const { stdout, stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', driverPath, '-PayloadBase64', encoded,
  ], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
  // A non-empty stderr alone is not a failure: Windows PowerShell mixes benign
  // warnings into stderr while the driver's JSON answer rides stdout. Only a
  // non-zero exit (execFile rejects) or unparsable stdout is an error.
  try {
    return JSON.parse(stdout) as T
  } catch {
    const detail = stderr.trim() ? ` stderr: ${stderr.trim().slice(0, 500)}` : ''
    throw new Error(`Windows driver returned invalid JSON: ${stdout.slice(0, 200)}${detail}`)
  }
}

export function screenBounds(): Promise<ScreenBounds> {
  return invokeWindows<ScreenBounds>('screenBounds')
}

export function screenshot(maxWidth: number, maxHeight: number): Promise<ScreenshotResult> {
  return invokeWindows<ScreenshotResult>('screenshot', { maxWidth, maxHeight })
}
