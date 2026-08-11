'use client'

import { Robot, Brain, Broadcast, Wrench, ShieldStar, CheckCircle } from '@phosphor-icons/react'

/**
 * Phosphor icons must render from a Client Component: @phosphor-icons/react
 * calls createContext at module scope, and under the RSC `react-server`
 * condition `createContext` is not available. Server components pass a
 * string key; this component resolves and renders the icon client-side.
 */
const ICONS = {
  robot: Robot,
  brain: Brain,
  broadcast: Broadcast,
  wrench: Wrench,
  shield: ShieldStar,
  check: CheckCircle,
}

export type FeatureIconName = keyof typeof ICONS

export function FeatureIcon({ name, size = 26 }: { name: FeatureIconName; size?: number }) {
  const Icon = ICONS[name]
  return <Icon size={size} weight="regular" className="text-brand" aria-hidden />
}
