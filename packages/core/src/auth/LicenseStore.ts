/**
 * LicenseStore — Read/write license and trial files
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { LicenseInfo, TrialInfo } from './types'

const CONFIG_DIR = join(homedir(), '.config', 'vectalon')
const LICENSE_FILE = join(CONFIG_DIR, 'license.json')
const TRIAL_FILE = join(CONFIG_DIR, 'trial.json')

export class LicenseStore {
  static read(): LicenseInfo | null {
    try {
      if (existsSync(LICENSE_FILE)) {
        return JSON.parse(readFileSync(LICENSE_FILE, 'utf-8'))
      }
    } catch {
      // Corrupted or missing license
    }
    return null
  }

  static write(license: LicenseInfo): void {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(LICENSE_FILE, JSON.stringify(license, null, 2))
  }

  static clear(): void {
    if (existsSync(LICENSE_FILE)) {
      writeFileSync(LICENSE_FILE, JSON.stringify({}, null, 2))
    }
  }

  static readTrial(): TrialInfo | null {
    try {
      if (existsSync(TRIAL_FILE)) {
        return JSON.parse(readFileSync(TRIAL_FILE, 'utf-8'))
      }
    } catch {
      // Corrupted or missing trial
    }
    return null
  }

  static writeTrial(trial: TrialInfo): void {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(TRIAL_FILE, JSON.stringify(trial, null, 2))
  }

  static clearTrial(): void {
    if (existsSync(TRIAL_FILE)) {
      writeFileSync(TRIAL_FILE, JSON.stringify({}, null, 2))
    }
  }
}
