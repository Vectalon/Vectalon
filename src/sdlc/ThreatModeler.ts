export interface Threat {
  id: string
  category: string
  description: string
  affectedComponent: string
  mitigations: string[]
}

interface StrideRule {
  category: string
  description: (target: string) => string
  mitigations: string[]
}

const STRIDE: StrideRule[] = [
  {
    category: 'Spoofing',
    description: target => `An attacker could impersonate a user or service in ${target}.`,
    mitigations: ['Use strong authentication (MFA)', 'Validate tokens and signatures', 'Enforce unique identifiers'],
  },
  {
    category: 'Tampering',
    description: target => `Data or code in ${target} could be modified in transit or at rest.`,
    mitigations: ['Use TLS everywhere', 'Sign payloads and verify integrity', 'Checksum critical data'],
  },
  {
    category: 'Repudiation',
    description: target => `A user could deny performing an action in ${target}.`,
    mitigations: ['Keep immutable audit logs', 'Timestamp and sign actions', 'Track actor identity on mutations'],
  },
  {
    category: 'Information Disclosure',
    description: target => `Sensitive data handled by ${target} could be exposed to unauthorized parties.`,
    mitigations: ['Encrypt data at rest and in transit', 'Apply least-privilege access', 'Redact logs and crash reports'],
  },
  {
    category: 'Denial of Service',
    description: target => `${target} could be overwhelmed or made unavailable.`,
    mitigations: ['Rate limit endpoints', 'Add request timeouts', 'Use autoscaling and caching'],
  },
  {
    category: 'Elevation of Privilege',
    description: target => `A user could gain unauthorized privileges within ${target}.`,
    mitigations: ['Enforce role-based access control', 'Validate authorization server-side', 'Patch dependencies promptly'],
  },
]

export class ThreatModeler {
  threatModel(features: string[], components: string[] = []): Threat[] {
    const feature = features[0] || components[0] || 'the application'
    const component = components[0] || features[0] || 'the application'
    return STRIDE.map((rule, index) => ({
      id: `T${index + 1}`,
      category: rule.category,
      description: rule.description(feature),
      affectedComponent: component,
      mitigations: rule.mitigations,
    }))
  }

  render(threats: Threat[]): string {
    const lines = [
      'Threat Model',
      '============',
      '',
      `Target: ${threats[0]?.affectedComponent || 'unknown'}`,
      '',
      'STRIDE Threats',
      '--------------',
      '',
      ...threats.flatMap(t => [
        `${t.id} [${t.category}]`,
        `  ${t.description}`,
        '  Mitigations:',
        ...t.mitigations.map(m => `  - ${m}`),
        '',
      ]),
    ]
    return lines.join('\n')
  }
}
