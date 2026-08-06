import pc from 'picocolors'

export const logger = {
  info(msg: string): void {
    process.stderr.write(`${pc.cyan('ℹ')} ${msg}\n`)
  },

  success(msg: string): void {
    process.stderr.write(`${pc.green('✔')} ${msg}\n`)
  },

  warn(msg: string): void {
    process.stderr.write(`${pc.yellow('⚠')} ${msg}\n`)
  },

  /** Debug trace; silent unless VECTALON_DEBUG=1 (used by reportError). */
  debug(msg: string): void {
    const enabled = process.env.VECTALON_DEBUG === '1' || process.env.VECTALON_DEBUG === 'true'
    if (enabled) {
      process.stderr.write(`${pc.dim('·')} ${msg}\n`)
    }
  },

  error(msg: string): void {
    process.stderr.write(`${pc.red('✖')} ${msg}\n`)
  },

  step(n: number, msg: string): void {
    process.stderr.write(`${pc.blue(`[${n}]`)} ${msg}\n`)
  },

  dim(msg: string): void {
    process.stderr.write(pc.dim(msg) + '\n')
  },

  raw(msg: string): void {
    process.stderr.write(msg)
  },

  out(msg: string): void {
    process.stdout.write(msg)
  },

  group(title: string, lines: string[]): void {
    process.stderr.write(pc.bold(title) + '\n')
    for (const line of lines) {
      process.stderr.write(`  ${line}\n`)
    }
  },
}
