import { PUBLIC_INSTALL_COMMAND } from '../lib/install-command'

describe('public install command', () => {
  it('runs the published scoped package instead of an unowned package name', () => {
    expect(PUBLIC_INSTALL_COMMAND).toBe(
      'npx --yes --package=@vectalon-dev/rn@latest -- vectalon init',
    )
    expect(PUBLIC_INSTALL_COMMAND).not.toContain('npx vectalon@')
  })
})
