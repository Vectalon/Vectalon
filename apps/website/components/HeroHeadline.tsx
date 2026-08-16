'use client'

import { useEffect, useState } from 'react'

export type HeroVariant = 'a' | 'b'

const STORAGE_KEY = 'vectalon-hero-ab'
const COOKIE_NAME = 'vectalon_ab'

/**
 * Hero headline A/B (Week 2 roadmap 2.3).
 *
 * Variant B — the "works offline" positioning — is the headline this release
 * ships: "Generate production-grade React Native code without sending your
 * source to the cloud." Variant A is the incumbent control ("The AI harness
 * that lives in your terminal"). Assignment is a 50/50 split persisted in
 * localStorage so each visitor stays in one bucket; the bucket is also
 * written to a `vectalon_ab` cookie and a `data-ab-bucket` attribute on
 * <html>, so the pricing-CTA click rate can be measured per variant by any
 * analytics hook. The server renders variant B by default (the shipped
 * headline); only visitors bucketed A swap on mount.
 */
export default function HeroHeadline() {
  const [variant, setVariant] = useState<HeroVariant>('b')

  useEffect(() => {
    let v = localStorage.getItem(STORAGE_KEY) as HeroVariant | ''
    if (v !== 'a' && v !== 'b') {
      v = Math.random() < 0.5 ? 'a' : 'b'
      try {
        localStorage.setItem(STORAGE_KEY, v)
      } catch {
        // Private mode / storage denied — the in-memory bucket still works.
      }
    }
    try {
      document.cookie = `${COOKIE_NAME}=${v}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // Cookie denied — the data attribute below still carries the bucket.
    }
    document.documentElement.setAttribute('data-ab-bucket', v)
    setVariant(v)
  }, [])

  return (
    <>
      <h1
        className="max-w-3xl animate-fade-up font-display text-[2rem] font-bold leading-[1.08] text-slate-50 sm:text-5xl lg:text-[3.4rem]"
        style={{ animationDelay: '60ms' }}
        data-ab-bucket={variant}
      >
        {variant === 'b'
          ? 'Generate production-grade React Native code without sending your source to the cloud'
          : 'The AI harness that lives in your terminal'}
        <span className="caret" />
      </h1>
      <p
        className="mt-5 max-w-xl animate-fade-up text-sm leading-relaxed text-slate-400 sm:text-base"
        style={{ animationDelay: '120ms' }}
        data-ab-bucket={variant}
      >
        {variant === 'b'
          ? 'A local 1.5B/3B/7B model on your laptop — Vectalon scans your project, builds a living knowledge base, and runs an MCP agent that writes, reviews, and heals your code, fully offline.'
          : 'Vectalon scans your project, builds a living knowledge base, and runs an MCP agent that writes, reviews, and heals your code.'}
      </p>
    </>
  )
}
