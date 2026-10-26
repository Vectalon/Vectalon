import * as fs from 'fs'
import * as path from 'path'

it('does not present illustrative outcome numbers as customer evidence', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../app/outcomes/page.tsx'), 'utf8')
  expect(page).toContain('not tracked developer time or measured savings')
  expect(page).not.toMatch(/Acme Corp|7,400|regressions prevented|build failures resolved/)
})
