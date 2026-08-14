/**
 * CLI tests for `vectalon diagnostics` (011-015) and `vectalon generate` (016-020).
 * Business Source License 1.1 (BSL-1.1)
 */
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const BIN = join(__dirname, '..', '..', 'bin', 'rn-vectalon.js')

let tmp: string
beforeEach(() => {
  tmp = join(__dirname, '.tmp-cli-diag')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.5', react: '18.3.1' } }))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function run(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf-8', timeout: 60_000 })
    return { code: 0, stdout, stderr: '' }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

describe('vectalon diagnostics (011-015)', () => {
  test('prints a readable report with all five categories', () => {
    const { code, stdout } = run(['diagnostics'], tmp)
    expect(code).toBe(0)
    expect(stdout).toContain('# Project Diagnostics')
    expect(stdout).toContain('Metro (011)')
    expect(stdout).toContain('Hermes (012)')
    expect(stdout).toContain('Android build (013)')
    expect(stdout).toContain('iOS build (014)')
    expect(stdout).toContain('Dependency conflicts (015)')
  })

  test('--json prints a parseable report and writes report files', () => {
    const { code, stdout } = run(['diagnostics', '--json'], tmp)
    expect(code).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.checks.length).toBeGreaterThan(0)
    expect(report.root).toBe(tmp)
    expect(existsSync(join(tmp, 'docs', 'vectalon', 'diagnostics', 'report.json'))).toBe(true)
    expect(existsSync(join(tmp, 'docs', 'vectalon', 'diagnostics', 'report.md'))).toBe(true)
  })

  test('--gradle-log classifies a real failure as a fail check', () => {
    writeFileSync(join(tmp, 'build.log'), "error: Failed to find target with hash string 'android-35'\n")
    const { code, stdout } = run(['diagnostics', '--json', '--gradle-log', join(tmp, 'build.log')], tmp)
    expect(code).toBe(0)
    const report = JSON.parse(stdout)
    const rc = report.checks.find((c: { id: string }) => c.id === 'gradle-log-root-cause')
    expect(rc).toBeDefined()
    expect(rc.status).toBe('fail')
  })
})

describe('vectalon generate (016-020)', () => {
  test('component: writes a typed TSX file', () => {
    const { code } = run(['generate', 'component', 'UserCard'], tmp)
    expect(code).toBe(0)
    const file = join(tmp, 'src', 'components', 'UserCard.tsx')
    expect(existsSync(file)).toBe(true)
  })

  test('screen: includes navigation hooks', () => {
    const { code } = run(['generate', 'screen', 'Profile'], tmp)
    expect(code).toBe(0)
    const content = readFileSync(join(tmp, 'src', 'screens', 'Profile.tsx'), 'utf-8')
    expect(content).toContain('@react-navigation/native')
    expect(content).toContain('useNavigation')
  })

  test('test: writes a Jest RTL test for a component', () => {
    const { code } = run(['generate', 'component', 'UserCard'], tmp)
    expect(code).toBe(0)
    const { code: code2 } = run(['generate', 'test', 'UserCard'], tmp)
    expect(code2).toBe(0)
    const testFile = join(tmp, '__tests__', 'user-card.test.tsx')
    expect(existsSync(testFile)).toBe(true)
    const content = readFileSync(testFile, 'utf-8')
    expect(content).toContain('@testing-library/react-native')
  })

  test('native-module: --spec JSON scaffolds both platforms', () => {
    const spec = JSON.stringify({ moduleName: 'CameraScanner', methods: [{ name: 'scan', args: [{ name: 'code', type: 'string' }], returns: 'string' }] })
    const { code } = run(['generate', 'native-module', 'CameraScanner', '--spec', spec], tmp)
    expect(code).toBe(0)
    // rn-cli scaffold writes ios/ + android/ files.
    const files = ['ios', 'android'].some(dir => existsSync(join(tmp, dir)))
    expect(files).toBe(true)
  })

  test('api: builds a typed client + apiBase from an OpenAPI spec', () => {
    const spec = join(tmp, 'openapi.json')
    writeFileSync(spec, JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Orders' },
      paths: { '/orders': { get: { operationId: 'listOrders', responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } } } } } },
    }))
    const { code } = run(['generate', 'api', 'OrdersApi', '--spec', spec], tmp)
    expect(code).toBe(0)
    expect(existsSync(join(tmp, 'src', 'services', 'OrdersApi.ts'))).toBe(true)
    expect(existsSync(join(tmp, 'src', 'services', 'apiBase.ts'))).toBe(true)
    const content = readFileSync(join(tmp, 'src', 'services', 'OrdersApi.ts'), 'utf-8')
    expect(content).toContain('export class OrdersApi')
  })

  test('--dry-run previews without writing', () => {
    const { code } = run(['generate', 'component', 'PreviewOnly', '--dry-run'], tmp)
    expect(code).toBe(0)
    expect(existsSync(join(tmp, 'src', 'components', 'PreviewOnly.tsx'))).toBe(false)
  })

  test('unknown type exits non-zero', () => {
    const { code, stderr } = run(['generate', 'nope', 'X'], tmp)
    expect(code).not.toBe(0)
    expect(stderr + '').toContain('Unknown generator')
  })
})
