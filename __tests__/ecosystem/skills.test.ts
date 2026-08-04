import {
  readSkillContent,
  readEnabledSkills,
  formatSkillsContext,
  formatSkillsPreview,
  buildSkillsSystemPrompt,
} from '../../src/ecosystem/skills'
import { getEcosystemItem } from '../../src/ecosystem'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('readSkillContent', () => {
  it('reads SKILL.md from .vectalon/skills/<id>', () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router'] }),
      '.vectalon/skills/expo-router/SKILL.md': '# Expo Router\nUse file-based routes.',
    })
    try {
      const item = getEcosystemItem('expo-router')
      expect(item).toBeDefined()
      const source = readSkillContent(dir, item!)
      expect(source).toEqual({ id: 'expo-router', name: 'Expo Router', content: '# Expo Router\nUse file-based routes.' })
    } finally {
      cleanup(dir)
    }
  })

  it('falls back to .agents/skills/<id>/SKILL.md', () => {
    const dir = createTempProject({
      '.agents/skills/expo-router/SKILL.md': '# Agent-installed skill\nDeep links.',
    })
    try {
      const source = readSkillContent(dir, getEcosystemItem('expo-router')!)
      expect(source?.content).toContain('Deep links')
    } finally {
      cleanup(dir)
    }
  })

  it('honors configPath when it differs from the id-derived directory', () => {
    // callstack-agent-skills ships its files under .vectalon/skills/callstack
    const dir = createTempProject({
      '.vectalon/skills/callstack/SKILL.md': '# Callstack\nFlashList best practices.',
    })
    try {
      const source = readSkillContent(dir, getEcosystemItem('callstack-agent-skills')!)
      expect(source?.id).toBe('callstack-agent-skills')
      expect(source?.content).toContain('FlashList')
    } finally {
      cleanup(dir)
    }
  })

  it('returns null when the skill is not installed anywhere', () => {
    const dir = createTempProject({})
    try {
      expect(readSkillContent(dir, getEcosystemItem('expo-router')!)).toBeNull()
    } finally {
      cleanup(dir)
    }
  })
})

describe('readEnabledSkills', () => {
  it('returns only enabled, installed skills in config order', () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router', 'callstack-agent-skills'] }),
      '.vectalon/skills/expo-router/SKILL.md': 'router content',
      '.vectalon/skills/callstack/SKILL.md': 'callstack content',
    })
    try {
      const sources = readEnabledSkills(dir)
      expect(sources.map(s => s.id)).toEqual(['expo-router', 'callstack-agent-skills'])
    } finally {
      cleanup(dir)
    }
  })

  it('skips enabled skills that are not installed', () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router', 'expo-ui'] }),
      '.vectalon/skills/expo-router/SKILL.md': 'router content',
    })
    try {
      const sources = readEnabledSkills(dir)
      expect(sources.map(s => s.id)).toEqual(['expo-router'])
    } finally {
      cleanup(dir)
    }
  })

  it('returns nothing when there is no ecosystem config', () => {
    const dir = createTempProject({})
    try {
      expect(readEnabledSkills(dir)).toEqual([])
    } finally {
      cleanup(dir)
    }
  })

  it('skips installed skills with empty or whitespace-only content', () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router', 'expo-ui'] }),
      '.vectalon/skills/expo-router/SKILL.md': '',
      '.vectalon/skills/expo-ui/SKILL.md': '   \n  ',
    })
    try {
      expect(readEnabledSkills(dir)).toEqual([])
    } finally {
      cleanup(dir)
    }
  })

  it('caps content per skill and respects maxSkills', () => {
    const long = 'x'.repeat(500)
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router', 'expo-ui', 'expo-dom'] }),
      '.vectalon/skills/expo-router/SKILL.md': long,
      '.vectalon/skills/expo-ui/SKILL.md': long,
      '.vectalon/skills/expo-dom/SKILL.md': long,
    })
    try {
      const sources = readEnabledSkills(dir, { maxCharsPerSkill: 100, maxSkills: 2 })
      expect(sources).toHaveLength(2)
      expect(sources[0].content.length).toBeLessThanOrEqual(100)
    } finally {
      cleanup(dir)
    }
  })
})

describe('formatSkillsContext', () => {
  it('renders a titled section with one block per skill', () => {
    const section = formatSkillsContext([
      { id: 'expo-router', name: 'Expo Router', content: 'Use file-based routes.' },
    ])
    expect(section).toContain('## Enabled project skills (best practices)')
    expect(section).toContain('### Expo Router (expo-router)')
    expect(section).toContain('Use file-based routes.')
  })

  it('stops when the total budget is exhausted', () => {
    const section = formatSkillsContext(
      [
        { id: 'a', name: 'A', content: 'y'.repeat(200) },
        { id: 'b', name: 'B', content: 'z'.repeat(200) },
      ],
      { maxTotalChars: 200 }
    )
    expect(section).toContain('### A (a)')
    expect(section).not.toContain('### B (b)')
  })
})

describe('formatSkillsPreview', () => {
  it('renders a header and the first content lines per skill', () => {
    const preview = formatSkillsPreview([
      { id: 'expo-router', name: 'Expo Router', content: '# Expo Router\nUse file-based routes.\nTyped routes are on by default.' },
    ])
    expect(preview).toContain('### Expo Router (expo-router)')
    expect(preview).toContain('Use file-based routes.')
    expect(preview).toContain('Typed routes are on by default.')
  })

  it('truncates to a few lines per skill with an ellipsis', () => {
    const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n')
    const preview = formatSkillsPreview([{ id: 'a', name: 'A', content }], { linesPerSkill: 3 })
    expect(preview).toContain('  line 1')
    expect(preview).toContain('  line 3')
    expect(preview).not.toContain('  line 4')
    expect(preview).toContain('7 more line(s) omitted')
  })

  it('caps long lines with a truncation marker and skips blank lines', () => {
    const preview = formatSkillsPreview(
      [{ id: 'a', name: 'A', content: '\n  \n' + 'x'.repeat(300) }],
      { maxLineLength: 20 }
    )
    expect(preview).toContain('  ' + 'x'.repeat(20) + '…')
    expect(preview).not.toContain(''.padEnd(30, 'x'))
  })

  it('returns an empty string for no skills', () => {
    expect(formatSkillsPreview([])).toBe('')
  })
})

describe('buildSkillsSystemPrompt', () => {
  it('appends the skills section to the caller system prompt', () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router'] }),
      '.vectalon/skills/expo-router/SKILL.md': 'Always use typed routes.',
    })
    try {
      const prompt = buildSkillsSystemPrompt(dir, 'You are a senior RN engineer.')
      expect(prompt).toContain('You are a senior RN engineer.')
      expect(prompt).toContain('## Enabled project skills (best practices)')
      expect(prompt).toContain('Always use typed routes.')
      expect(prompt!.indexOf('You are')).toBeLessThan(prompt!.indexOf('## Enabled'))
    } finally {
      cleanup(dir)
    }
  })

  it('returns the section alone when no base system prompt is given', () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router'] }),
      '.vectalon/skills/expo-router/SKILL.md': 'content',
    })
    try {
      const prompt = buildSkillsSystemPrompt(dir)
      expect(prompt).toContain('## Enabled project skills (best practices)')
    } finally {
      cleanup(dir)
    }
  })

  it('returns the base prompt untouched when no skills are installed', () => {
    const dir = createTempProject({})
    try {
      expect(buildSkillsSystemPrompt(dir, 'keep me')).toBe('keep me')
      expect(buildSkillsSystemPrompt(dir)).toBeUndefined()
    } finally {
      cleanup(dir)
    }
  })
})
