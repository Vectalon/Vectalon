export interface UserStoryCard {
  id: string
  as: string
  want: string
  soThat: string
}

export interface StoryInput {
  feature: string
  personas?: string[]
}

const DEFAULT_BENEFIT = 'I can achieve my goal'

export class StoryWriter {
  storyCards(feature: string, personas: string[] = ['user']): UserStoryCard[] {
    return personas.map((persona, index) => ({
      id: `US-${index + 1}`,
      as: persona,
      want: feature,
      soThat: DEFAULT_BENEFIT,
    }))
  }

  writeUserStories(input: StoryInput): string {
    const { feature, personas = ['user'] } = input
    const cards = this.storyCards(feature, personas)

    const lines = [
      `# User Stories — ${feature}`,
      '',
      ...cards.map(card => `- As a ${card.as}, I want to ${card.want} so that ${card.soThat}.`),
      '',
    ]
    return lines.join('\n')
  }
}
