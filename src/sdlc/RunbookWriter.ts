export interface RunbookInput {
  title: string
  symptoms?: string[]
  steps?: string[]
  owner?: string
}

export class RunbookWriter {
  writeRunbook(input: RunbookInput): string {
    const { title, symptoms = [], steps = [], owner = 'on-call engineer' } = input
    const symptomList = symptoms.length ? symptoms.map(s => `- ${s}`).join('\n') : '- TBD'
    const stepList = steps.length
      ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '- TBD'

    return [
      `# Runbook: ${title}`,
      '',
      `Owner: ${owner}`,
      '',
      '## Symptoms',
      '',
      symptomList,
      '',
      '## Steps',
      '',
      stepList,
      '',
      '## Escalation',
      '',
      '- If unresolved after 30 minutes, escalate to the platform team.',
      '',
      '## Verification',
      '',
      '- Confirm the fix with a health check.',
      '',
    ].join('\n')
  }
}
