import { StoryWriter } from '../../src/sdlc/StoryWriter'

describe('StoryWriter', () => {
  it('generates a user story for the default persona', () => {
    const stories = new StoryWriter().writeUserStories({ feature: 'sync offline changes' })
    expect(stories).toContain('As a user, I want to sync offline changes')
    expect(stories).toContain('so that I can')
  })

  it('generates one story per persona', () => {
    const writer = new StoryWriter()
    const cards = writer.storyCards('sign up', ['new user', 'returning user'])
    expect(cards).toHaveLength(2)
    expect(cards[0].as).toBe('new user')
    expect(cards[1].as).toBe('returning user')

    const text = writer.writeUserStories({ feature: 'sign up', personas: ['new user', 'returning user'] })
    expect(text).toContain('new user')
    expect(text).toContain('returning user')
  })

  it('story cards have stable ids and the role/want/benefit parts', () => {
    const cards = new StoryWriter().storyCards('pay invoices')
    expect(cards[0].id).toMatch(/^US-\d+$/)
    expect(cards[0].as).toBe('user')
    expect(cards[0].want).toBe('pay invoices')
    expect(cards[0].soThat.length).toBeGreaterThan(0)
  })
})
