'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The hero prompt line. The shell prompt appears instantly (a real terminal
 * draws its prompt, then you type), then the line rotates through a few real
 * intel headlines — each types itself out, holds with its source tag, and
 * erases — and finally lands on the install command with the blinking caret.
 * Hovering the line pauses the rotation in place; leaving resumes it. While
 * a headline is held, the document title cycles with it, so the browser tab
 * tracks the same feed; the default title restores when the command lands.
 *
 * Reduced-motion users get the command immediately. Screen readers get the
 * full command via the sr-only span; the live-typed copy is aria-hidden.
 */

const TYPE_MS = 30 // per-character pace while rotating headlines
const ERASE_MS = 18 // per-character pace while erasing a headline
const HOLD_MS = 1200 // how long each headline stays before erasing
const COMMAND_TYPE_MS = 42 // the landing command types at the original pace
const START_DELAY_MS = 650 // after the prompt block's fade-up settles
const LOOP_PAUSE_MS = 20_000 // how long the landed command shows before the next cycle

type Phase = 'typing' | 'holding' | 'erasing' | 'landing'

export type TypePromptHeadline = { label: string; tag: string }

export function TypePrompt({
  headlines = [],
  command = 'npx vectalon init',
}: {
  headlines?: TypePromptHeadline[]
  command?: string
}) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('typing')
  const [heldTag, setHeldTag] = useState<string | null>(null)
  const pausedRef = useRef(false)
  const defaultTitleRef = useRef('')
  const landed = phase === 'landing' && text === command

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(command)
      setPhase('landing')
      return
    }

    // Remember the real page title so the tab can be restored exactly.
    defaultTitleRef.current = document.title

    let cancelled = false
    // Pause-aware sleep: when the timer fires it waits while the line is
    // hovered, so the animation freezes mid-step and resumes on leave.
    const sleep = (ms: number) =>
      new Promise<void>(resolve => {
        setTimeout(() => {
          const waitToResume = async () => {
            while (pausedRef.current) {
              if (cancelled) {
                resolve()
                return
              }
              await new Promise(r => setTimeout(r, 50))
            }
            resolve()
          }
          void waitToResume()
        }, ms)
      })

    const run = async () => {
      await sleep(START_DELAY_MS)
      if (cancelled) return

      // Cycle forever: headlines, land on the command, hold, repeat.
      while (!cancelled) {
        for (const h of headlines) {
          setPhase('typing')
          setHeldTag(null)
          for (let i = 1; i <= h.label.length; i++) {
            setText(h.label.slice(0, i))
            await sleep(TYPE_MS)
            if (cancelled) return
          }
          setPhase('holding')
          setHeldTag(h.tag)
          document.title = `${h.label} — vectalon`
          await sleep(HOLD_MS)
          if (cancelled) return
          setPhase('erasing')
          setHeldTag(null)
          for (let i = h.label.length - 1; i >= 0; i--) {
            setText(h.label.slice(0, i))
            await sleep(ERASE_MS)
            if (cancelled) return
          }
        }

        // Land on the real command and let the caret blink; the tab returns
        // to the page's own title.
        setPhase('landing')
        setHeldTag(null)
        document.title = defaultTitleRef.current
        for (let i = 1; i <= command.length; i++) {
          setText(command.slice(0, i))
          await sleep(COMMAND_TYPE_MS)
          if (cancelled) return
        }
        await sleep(LOOP_PAUSE_MS)
      }
    }

    void run()
    return () => {
      cancelled = true
      document.title = defaultTitleRef.current
    }
  }, [command, headlines])

  return (
    <span
      onMouseEnter={() => {
        pausedRef.current = true
      }}
      onMouseLeave={() => {
        pausedRef.current = false
      }}
    >
      <span className="text-brand">vectalon@main:~$</span>{' '}
      <span aria-hidden="true">{text}</span>
      {heldTag && phase === 'holding' && (
        <span className="text-brand" aria-hidden="true">
          {' '}[{heldTag}]
        </span>
      )}
      <span className="sr-only">{command}</span>
      <span
        className={landed ? 'caret' : 'caret-solid'}
        aria-hidden="true"
      />
    </span>
  )
}
