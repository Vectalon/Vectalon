/**
 * Minimal y/N confirmation prompt for interactive terminals. No dependency —
 * uses node:readline. Non-TTY callers should guard before calling.
 */
import { createInterface } from 'readline'

export function readlineConfirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close()
      resolve(/^y(?:es)?$/i.test(answer.trim()))
    })
  })
}
