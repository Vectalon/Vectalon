export class AcceptanceCriteriaWriter {
  writeAcceptanceCriteria(story: string): string {
    const want = extractWant(story) || 'complete the feature'
    return [
      '## Acceptance Criteria',
      '',
      `- Given the user has access to the feature, when they ${want}, then the feature behaves as expected.`,
      `- Given valid input, when they ${want}, then the system saves the change and confirms success.`,
      `- Given invalid or missing input, when they ${want}, then the user sees a clear error message.`,
      '',
    ].join('\n')
  }
}

function extractWant(story: string): string {
  const match = story.match(/I want (.+?)( so that |\.|$)/i)
  if (match) return match[1].trim().replace(/\.$/, '')
  return story.trim().replace(/\.$/, '')
}
