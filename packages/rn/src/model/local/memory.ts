import { execFileSync } from 'child_process'
import { freemem, platform, totalmem } from 'os'

/** Available-budget estimate, not a peak-memory predictor or allocation guarantee. */
export function nativeMemoryBudget(): { availableBytes: number; source: 'macos-pressure-estimate' | 'os-free' } {
  if (platform() === 'darwin') {
    try {
      // No allocation/pressure-injection arguments: quiet system-state query only.
      const output = execFileSync('/usr/bin/memory_pressure', ['-Q'], { encoding: 'utf8', timeout: 1000, maxBuffer: 16384, stdio: ['ignore', 'pipe', 'ignore'] })
      const match = output.match(/^System-wide memory free percentage:\s*(\d+)%\s*$/m)
      const percent = match ? Number(match[1]) : NaN
      if (Number.isInteger(percent) && percent >= 0 && percent <= 100) {
        return { availableBytes: Math.floor(totalmem() * percent / 100), source: 'macos-pressure-estimate' }
      }
    } catch { /* Conservative raw-free fallback when the system query is unavailable. */ }
  }
  return { availableBytes: freemem(), source: 'os-free' }
}
