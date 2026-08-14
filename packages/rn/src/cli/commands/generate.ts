/**
 * vectalon generate — Code Generation (Roadmap 016-020): components, screens,
 * tests, native modules, and API clients. Deterministic templates; writes
 * files into the project unless --dry-run.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { ComponentGenerator } from '../../sdlc/ComponentGenerator'
import { TestWriter } from '../../sdlc/TestWriter'
import { NativeModuleGenerator, parseNativeModuleSpec } from '../../sdlc/NativeModuleGenerator'
import { parseOpenApi, buildApiClient } from '../../sdlc/ApiClientGenerator'

export interface GenerateOptions {
  dryRun?: boolean
  typescript?: boolean
  styles?: boolean
  navigation?: boolean
  framework?: 'jest' | 'detox'
  api?: 'rn-cli' | 'expo'
  spec?: string
}

type GenerateType = 'component' | 'screen' | 'test' | 'native-module' | 'api'

function pascalCase(name: string): string {
  return name.replace(/[-_\s]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/^[a-z]/, c => c.toUpperCase())
}

function kebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

interface WrittenFile {
  path: string
  content: string
}

function writeAll(root: string, files: WrittenFile[], dryRun: boolean): void {
  for (const file of files) {
    const full = join(root, file.path)
    if (dryRun) {
      logger.info(pc.dim(`[dry-run] would write ${file.path}`))
      continue
    }
    mkdirSync(dirname(full), { recursive: true })
    const existed = existsSync(full)
    writeFileSync(full, file.content)
    logger.success(`${existed ? 'overwrote' : 'wrote'} ${file.path}`)
  }
}

function resolveSpecInput(root: string, spec: string | undefined): string {
  if (!spec) throw new Error('--spec <path|json> is required for this generator (a JSON spec string or a path to one)')
  if (spec.trim().startsWith('{')) return spec
  const path = resolve(root, spec)
  if (!existsSync(path)) throw new Error(`Spec file not found: ${path}`)
  return readFileSync(path, 'utf-8')
}

function generateFiles(root: string, type: GenerateType, name: string, options: GenerateOptions): WrittenFile[] {
  const componentGenerator = new ComponentGenerator()
  switch (type) {
    case 'component': {
      const content = componentGenerator.generate(pascalCase(name), {
        typescript: options.typescript ?? true,
        styles: options.styles ?? true,
        navigation: options.navigation ?? false,
      })
      return [{ path: join('src', 'components', `${pascalCase(name)}.tsx`), content: content + '\n' }]
    }
    case 'screen': {
      const content = componentGenerator.generate(pascalCase(name), {
        typescript: options.typescript ?? true,
        styles: options.styles ?? true,
        navigation: true,
      })
      return [{ path: join('src', 'screens', `${pascalCase(name)}.tsx`), content: content + '\n' }]
    }
    case 'test': {
      const target = name.startsWith('src/') || name.startsWith('./') ? name : `../src/components/${pascalCase(name)}`
      const componentName = basename(name).replace(/\.(tsx?|jsx?)$/, '')
      const content = new TestWriter().writeForComponent(target, pascalCase(componentName), options.framework ?? 'jest')
      const ext = options.framework === 'detox' ? '.e2e.ts' : '.test.tsx'
      return [{ path: join('__tests__', `${kebabCase(componentName)}${ext}`), content: content + '\n' }]
    }
    case 'native-module': {
      const specText = resolveSpecInput(root, options.spec)
      const spec = parseNativeModuleSpec(specText)
      const result = new NativeModuleGenerator().generate(spec, { api: options.api ?? 'rn-cli' })
      return result.files.map(f => ({ path: f.path, content: f.content }))
    }
    case 'api': {
      const specText = resolveSpecInput(root, options.spec)
      const spec = parseOpenApi(specText, pascalCase(name))
      const { content } = buildApiClient(spec)
      const apiBase = [
        `/* Shared API base for generated clients. */`,
        `export class ApiError extends Error {`,
        `  readonly status: number`,
        `  readonly detail: string`,
        `  constructor(message: string, status: number, detail: string) {`,
        `    super(message)`,
        `    this.name = 'ApiError'`,
        `    this.status = status`,
        `    this.detail = detail`,
        '  }',
        '}',
        '',
      ].join('\n')
      return [
        { path: join('src', 'services', `${pascalCase(name)}.ts`), content },
        { path: join('src', 'services', 'apiBase.ts'), content: apiBase },
      ]
    }
  }
}

export async function generateCommand(type: string, name: string, options: GenerateOptions): Promise<void> {
  const root = resolve(process.cwd())
  const t = type.toLowerCase() as GenerateType
  const valid: GenerateType[] = ['component', 'screen', 'test', 'native-module', 'api']
  if (!valid.includes(t)) {
    logger.error(`Unknown generator "${type}". Valid: ${valid.join(', ')}`)
    process.exit(1)
  }
  if (!name && t !== 'native-module' && t !== 'api') {
    logger.error('A name argument is required (e.g. `vectalon generate component UserCard`)')
    process.exit(1)
  }

  logger.info(pc.bold(`vectalon generate ${t}`))
  logger.info(`project: ${root}`)
  logger.info('')

  const files = generateFiles(root, t, name || '', options)
  if (options.dryRun) {
    logger.info(pc.dim(`Would write ${files.length} file(s):`))
    for (const f of files) {
      logger.info(`  ${pc.dim(f.path)}`)
      process.stdout.write(f.content + '\n')
    }
    logger.info('')
    logger.info(pc.dim(`--dry-run: nothing written. Remove --dry-run to write these files.`))
    return
  }

  writeAll(root, files, false)
  logger.success(`${files.length} file(s) generated`)
}
