'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Global ambient particle layer — fixed-position, full-viewport,
 * runs on every page behind all content. Fewer and more subtle than
 * the hero particles to avoid competing with page content.
 *
 * Pauses offscreen via IntersectionObserver (always visible since it's
 * fixed, but the observer prevents wasted frames when the tab is hidden).
 * Reacts to theme changes for blend mode and alpha.
 */
export function GlobalParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    const particles: Array<{
      x: number; y: number; vx: number; vy: number
      r: number; color: string; alpha: number; phase: number
    }> = []

    const COLORS = [
      '0, 230, 195',   // teal
      '55, 182, 255',  // cyan
      '139, 92, 246',  // violet
    ]

    function resize() {
      const dpr = window.devicePixelRatio || 1
      canvas!.width = window.innerWidth * dpr
      canvas!.height = window.innerHeight * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function spawn() {
      const dark = isDark
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      return {
        x: Math.random() * window.innerWidth,
        y: window.innerHeight + Math.random() * 20,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -(0.08 + Math.random() * 0.2),
        r: dark ? 0.8 + Math.random() * 1.2 : 1 + Math.random() * 1.5,
        color,
        alpha: dark ? 0.06 + Math.random() * 0.14 : 0.1 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
      }
    }

    function draw(t: number) {
      if (!running) return
      const w = window.innerWidth
      const h = window.innerHeight
      ctx!.clearRect(0, 0, w, h)

      const target = isDark ? 18 : 14
      while (particles.length < target) particles.push(spawn())

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx + Math.sin(t * 0.0003 + p.phase) * 0.1
        p.y += p.vy
        if (p.y < -10) { particles.splice(i, 1); continue }

        const pulse = 0.75 + 0.25 * Math.sin(t * 0.0008 + p.phase)
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${p.color}, ${p.alpha * pulse})`
        ctx!.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    particles.length = 0
    raf = requestAnimationFrame(draw)

    // Pause when tab hidden
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf) }
      else { running = true; raf = requestAnimationFrame(draw) }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [isDark])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen"
      style={{ mixBlendMode: isDark ? 'screen' : 'normal' }}
    />
  )
}
