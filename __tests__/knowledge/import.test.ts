import { join } from 'path'
import { importCommand } from '../../src/cli/commands/import'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('importCommand', () => {
  let dir: string

  beforeEach(() => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('imports a markdown file with frontmatter', async () => {
    dir = createTempProject({
      'docs/prd.md': '---\ntitle: My PRD\ntype: product\n---\n# My PRD\n\nBody here',
    })
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    await importCommand(join(dir, 'docs/prd.md'), {})

    const store = new ArtifactStore(dir)
    expect(store.findByType('product')).toHaveLength(1)
    expect(store.list()[0].title).toBe('My PRD')
    expect(store.list()[0].content).toContain('Body here')
  })

  it('applies --type and --title overrides', async () => {
    dir = createTempProject({ 'notes.md': 'Some notes with no metadata' })
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    await importCommand(join(dir, 'notes.md'), { type: 'requirements', title: 'Story Notes' })

    const store = new ArtifactStore(dir)
    expect(store.list()[0]).toMatchObject({ type: 'requirements', title: 'Story Notes' })
  })

  it('auto-detects type from content keywords', async () => {
    dir = createTempProject({ 'qa.md': 'Test Plan for the payment flow\n' })
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    await importCommand(join(dir, 'qa.md'), {})

    const store = new ArtifactStore(dir)
    expect(store.list()[0].type).toBe('qa')
  })

  it('skips duplicate content', async () => {
    dir = createTempProject({ 'docs/prd.md': '# PRD\n\nbody' })
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    const file = join(dir, 'docs/prd.md')

    await importCommand(file, {})
    await importCommand(file, {})

    const store = new ArtifactStore(dir)
    expect(store.list()).toHaveLength(1)
  })

  it('imports every file in a directory', async () => {
    dir = createTempProject({
      'docs/prd.md': '---\ntype: product\ntitle: PRD\n---\nbody',
      'docs/stories.json': JSON.stringify([
        { title: 'Story A', type: 'requirements', content: 'As a user...' },
        { title: 'Story B', type: 'requirements', content: 'As an admin...' },
      ]),
    })
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    await importCommand(dir, {})

    const store = new ArtifactStore(dir)
    expect(store.list()).toHaveLength(3)
    expect(store.findByType('requirements')).toHaveLength(2)
  })
})
