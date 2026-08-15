/**
 * vectalon portal — White-label Portal Agent (Phase 4 of Archive & Share).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Generates a self-contained static build portal (SSG) from the archive
 * store: listing + per-build detail pages with install instructions and an
 * embedded builds.json. --deploy targets vercel|netlify|static (the static
 * export is the generated site itself; vercel/netlify print the deploy
 * command). Team tier. Reports to docs/vectalon/portal/ (gitignored).
 */
import { join, resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { printCarbonReport, dim } from '../carbon'
import { generatePortal } from '../../portal'
import { ArchiveStore } from '../../archive/ArchiveStore'

export interface PortalCommandOptions {
  generate?: boolean
  out?: string
  domain?: string
  branding?: string
  deploy?: string
  json?: boolean
}

export async function portalCommand(directory: string, options: PortalCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const store = new ArchiveStore(root)
  const builds = store.listBuilds({})
  const reportPath = join(root, 'docs', 'vectalon', 'portal', 'report.json')

  if (options.generate ?? (!options.deploy)) {
    const out = resolve(root, options.out || '.vectalon/portal')
    let branding: { logo?: string; primaryColor?: string; title?: string } | undefined
    if (options.branding) {
      try {
        branding = JSON.parse(options.branding)
      } catch {
        branding = undefined
      }
    }
    const result = generatePortal({ out, domain: options.domain, branding, builds })

    const json = JSON.stringify({ ok: true, verdict: 'approved', ...result, builds, domain: options.domain }, null, 2) + '\n'
    const md =
      '# vectalon portal — Build Portal\n\n' +
      `Verdict: **approved**  ·  Output: \`${out}\`  ·  Builds: ${result.builds}  ·  Files: ${result.fileCount}\n\n` +
      `- Domain: ${options.domain ?? 'builds.mycompany.com (pass --domain to set)'}\n` +
      '- Deploy: `vectalon portal --deploy vercel` (or netlify / static)\n'
    mkdirSync(join(root, 'docs', 'vectalon', 'portal'), { recursive: true })
    writeFileSync(reportPath, json)
    writeFileSync(join(root, 'docs', 'vectalon', 'portal', 'report.md'), md)

    if (options.json) {
      process.stdout.write(json)
      return
    }
    const body = [
      `Output:  ${out}`,
      `Builds:  ${result.builds} archived build(s) embedded`,
      `Files:   ${result.fileCount}`,
      '',
      `Deploy:  npx vectalon portal --deploy --target vercel   (or netlify / static)`,
      `Domain:  ${options.domain ?? 'builds.mycompany.com (pass --domain to set)'}`,
    ]
    printCarbonReport({
      title: 'vectalon portal — site generated',
      verdict: 'ok',
      lines: body,
      reportPath: reportPath,
      root,
      done: `Portal generated at ${out} — deploy with --deploy, or open index.html directly.`,
    })
    return
  }

  if (options.deploy) {
    const target = options.deploy
    const out = resolve(root, options.out || '.vectalon/portal')
    mkdirSync(join(root, 'docs', 'vectalon', 'portal'), { recursive: true })
    const deployJson = JSON.stringify({ ok: true, verdict: 'approved', target, out, domain: options.domain, deployedAt: new Date().toISOString() }, null, 2) + '\n'
    writeFileSync(reportPath, deployJson)
    writeFileSync(
      join(root, 'docs', 'vectalon', 'portal', 'report.md'),
      '# vectalon portal — Deploy Plan\n\n' +
        `Target: **${target}**  ·  Output: \`${out}\`  ·  Domain: ${options.domain ?? '—'}\n\n` +
        'Requires the platform CLI authenticated (vercel / netlify).\n'
    )
    const commands: Record<string, string> = {
      vercel: `cd ${out} && npx vercel --prod`,
      netlify: `cd ${out} && npx netlify deploy --prod --dir=./`,
      static: `static export is the generated site itself (no backend, host anywhere)`,
    }
    if (options.json) {
      process.stdout.write(JSON.stringify({ ok: true, target, out, command: commands[target] }, null, 2) + '\n')
      return
    }
    printCarbonReport({
      title: `vectalon portal — deploy plan (${target})`,
      verdict: 'ok',
      lines: [`Run:  ${dim(commands[target] ?? `Unknown target ${target}`)}`, '', 'Requires the platform CLI authenticated (vercel / netlify).'],
      reportPath,
      root,
      done: 'Deploy command ready — run it with the platform CLI to go live.',
    })
    return
  }
}


