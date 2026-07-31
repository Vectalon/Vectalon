import { RunbookWriter } from '../../src/sdlc/RunbookWriter'

describe('RunbookWriter', () => {
  it('writes a runbook with symptoms, steps, and escalation', () => {
    const runbook = new RunbookWriter().writeRunbook({
      title: 'Restart the backend',
      symptoms: ['High latency', 'Error rate above 5%'],
      steps: ['SSH to the host', 'Restart the service', 'Verify health endpoint'],
    })
    expect(runbook).toContain('# Runbook: Restart the backend')
    expect(runbook).toContain('## Symptoms')
    expect(runbook).toContain('- High latency')
    expect(runbook).toContain('## Steps')
    expect(runbook).toContain('1. SSH to the host')
    expect(runbook).toContain('2. Restart the service')
    expect(runbook).toContain('3. Verify health endpoint')
    expect(runbook).toContain('## Escalation')
  })

  it('defaults the owner to the on-call engineer', () => {
    const runbook = new RunbookWriter().writeRunbook({ title: 'Restart the backend' })
    expect(runbook).toContain('Owner: on-call engineer')
  })
})
