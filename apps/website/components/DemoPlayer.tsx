'use client'

import { useEffect, useRef, useState } from 'react'
import { ThinkingOrb } from 'thinking-orbs'

/**
 * The demo console. While demo/full-demo.mp4 buffers, the frame runs a
 * terminal-style boot log (the recording session as it happened); once the
 * video can play it hands off to playback.
 *
 * The video is always mounted so its canplay/error events are real; while it
 * loads it sits muted behind an opaque boot overlay that carries the log.
 * Handoff removes the overlay, revealing the already-buffered playback. Both
 * stages share the frame's 8/5 aspect so nothing jumps (no CLS). If the
 * video never loads, the overlay reports the failure and links to the
 * recording on GitHub.
 */

const MIN_BOOT_MS = 2000
const LOAD_TIMEOUT_MS = 12000

const BOOT_LINES: Array<{ pre: string; text: string; cls: string }> = [
  { pre: '$', text: 'vectalon --record demo/full-demo.mp4', cls: 'text-term-brand' },
  { pre: '◆', text: 'booting sandbox — expo 53 · react-native 0.79', cls: 'text-slate-500' },
  { pre: '✔', text: 'scanned 19 screens · 6 hooks · 5 services', cls: 'text-emerald-400' },
  { pre: '◆', text: 'capturing session — 85s · 25fps', cls: 'text-slate-500' },
  { pre: '✔', text: 'arch: module graph clean — 0 error findings', cls: 'text-emerald-400' },
  { pre: '✔', text: 'bench: 6 scenarios · 100% composite', cls: 'text-emerald-400' },
  { pre: '✔', text: 'ffmpeg encode — demo/full-demo.mp4', cls: 'text-emerald-400' },
  { pre: '✦', text: 'handoff — starting playback', cls: 'text-slate-500' },
]

export function DemoPlayer() {
  const [canPlay, setCanPlay] = useState(false)
  const [stage, setStage] = useState<'booting' | 'ready' | 'error'>('booting')
  const startRef = useRef(Date.now())
  const videoRef = useRef<HTMLVideoElement>(null)

  // The video is server-rendered, so its canplay event can fire during HTML
  // parsing — before React attaches handlers. Watch readiness imperatively:
  // check the readyState once on mount (SSR catch-up) and listen natively.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const check = () => {
      if (v.readyState >= 3) setCanPlay(true) // HAVE_FUTURE_DATA
    }
    check()
    v.addEventListener('canplay', check)
    v.addEventListener('canplaythrough', check)
    v.addEventListener('loadeddata', check)
    return () => {
      v.removeEventListener('canplay', check)
      v.removeEventListener('canplaythrough', check)
      v.removeEventListener('loadeddata', check)
    }
  }, [])

  // Once the video can play, hold the boot moment for the remainder of the
  // minimum display time, then hand off.
  useEffect(() => {
    if (!canPlay) return
    const elapsed = Date.now() - startRef.current
    const wait = Math.max(0, MIN_BOOT_MS - elapsed)
    const t = setTimeout(() => setStage('ready'), wait)
    return () => clearTimeout(t)
  }, [canPlay])

  // If the video never signals it can play, fail gracefully instead of
  // spinning on the boot log forever.
  useEffect(() => {
    const t = setTimeout(() => {
      setStage(s => (s === 'booting' ? 'error' : s))
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="term">
      <div className="term-head">
        <div className="flex gap-1.5">
          <span className="term-dot bg-red-400/70" />
          <span className="term-dot bg-yellow-400/70" />
          <span className="term-dot bg-green-400/70" />
        </div>
        <span className="text-xs text-term-meta">demo/full-demo.mp4 — v0.2.0</span>
      </div>

      <div className="relative">
        <video
          ref={videoRef}
          className="aspect-[8/5] w-full bg-black/30 object-contain"
          controls
          muted
          playsInline
          autoPlay
          loop
          poster="/demo/full-demo-poster.jpg"
          aria-label="Vectalon demo — 90-second CLI walkthrough"
          onError={() => setStage('error')}
        >
          <source src="/demo/full-demo.mp4" type="video/mp4" />
          Your browser doesn&apos;t support the video tag — watch the walkthrough on{' '}
          <a
            href="https://github.com/Vectalon/Vectalon/blob/main/apps/website/demo/recording/README.md"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </video>

        {stage !== 'ready' && (
          <div
            className="term-body absolute inset-0 flex flex-col justify-center"
            style={{ backgroundColor: 'rgb(var(--term))' }}
            aria-hidden={stage === 'booting'}
          >
            {stage === 'booting' ? (
              <div className="flex flex-col items-center gap-4">
                <ThinkingOrb state="working" size={64} theme="dark" aria-label="Loading demo video" />
              <ul className="space-y-2">
                {BOOT_LINES.map((l, i) => (
                  <li
                    key={i}
                    className="boot-line flex gap-2.5 whitespace-nowrap"
                    style={{ animationDelay: `${i * 260}ms` }}
                  >
                    <span className={l.cls}>{l.pre}</span>
                    <span>{l.text}</span>
                  </li>
                ))}
                <li
                  className="boot-line flex gap-2.5"
                  style={{ animationDelay: `${BOOT_LINES.length * 260}ms` }}
                >
                  <span className="text-term-brand">$</span>
                  <span className="caret" />
                </li>
              </ul>
              </div>
            ) : (
              <p className="flex flex-col gap-1.5">
                <span className="text-red-400">✘ failed to load demo/full-demo.mp4</span>
                <span className="text-slate-500">
                  $ open the recording on{' '}
                  <a
                    href="https://github.com/Vectalon/Vectalon/blob/main/apps/website/demo/recording/README.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    GitHub →
                  </a>
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
