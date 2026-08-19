'use client'

import { ThinkingOrb } from 'thinking-orbs'

/**
 * Thin client wrapper around ThinkingOrb for use in server-component pages.
 * The agents page is a server component; this keeps the canvas-based orb
 * client-only while staying importable from the server tree.
 */
export function AgentOrb({
  state = 'connecting',
  size = 20,
  label,
}: {
  state?: 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping'
  size?: 64 | 20
  label?: string
}) {
  return (
    <ThinkingOrb
      state={state}
      size={size}
      theme="auto"
      aria-label={label}
      className="inline-block align-middle"
    />
  )
}
