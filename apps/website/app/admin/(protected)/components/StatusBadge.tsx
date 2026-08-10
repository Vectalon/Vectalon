const MAP: Record<string, { cls: string; label: string }> = {
  active: { cls: 'badge badge-ok', label: 'active' },
  trialing: { cls: 'badge badge-warn', label: 'trialing' },
  pending: { cls: 'badge badge-warn', label: 'pending' },
  revoked: { cls: 'badge badge-danger', label: 'revoked' },
  expired: { cls: 'badge badge-muted', label: 'expired' },
  churned: { cls: 'badge badge-muted', label: 'churned' },
}

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { cls: 'badge badge-muted', label: status }
  return <span className={m.cls}>{m.label}</span>
}

export function TierBadge({ tier }: { tier: string }) {
  const color =
    tier === 'enterprise'
      ? 'badge badge-danger'
      : tier === 'team'
        ? 'badge badge-warn'
        : tier === 'pro'
          ? 'badge badge-ok'
          : 'badge badge-muted'
  return <span className={color}>{tier}</span>
}
