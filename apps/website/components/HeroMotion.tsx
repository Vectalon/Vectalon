'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Ambient particle canvas for the hero section.
 *
 * Floating brand-colored dots drift upward with slight horizontal oscillation.
 * In dark mode they glow brightly with screen blending;
 * in light mode they use normal blending with higher alpha so they're visible.
 * The canvas is purely decorative (aria-hidden, pointer-events-none) and
 * pauses when offscreen via IntersectionObserver.
 */
export function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDarkMode, setIsDarkMode] = useState(true)

  // React to theme changes
  useEffect(() => {
    const check = () => setIsDarkMode(document.documentElement.classList.contains('dark'))
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
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

    const BRAND_COLORS = [
      '0, 230, 195',   // teal
      '55, 182, 255',  // cyan
      '139, 92, 246',  // violet
      '0, 210, 180',   // teal-dim
    ]

    function resize() {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas!.getBoundingClientRect()
      canvas!.width = rect.width * dpr
      canvas!.height = rect.height * dpr
      ctx!.scale(dpr, dpr)
    }

    function createParticle() {
      const dark = isDarkMode
      const color = BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)]
      return {
        x: Math.random() * (canvas!.getBoundingClientRect().width || 800),
        y: (canvas!.getBoundingClientRect().height || 500) + Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(0.15 + Math.random() * 0.35),
        r: dark ? 1.2 + Math.random() * 1.8 : 1.5 + Math.random() * 2,
        color,
        alpha: dark ? 0.15 + Math.random() * 0.35 : 0.35 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      }
    }

    function draw(time: number) {
      if (!running) return
      const w = canvas!.getBoundingClientRect().width
      const h = canvas!.getBoundingClientRect().height
      ctx!.clearRect(0, 0, w, h)

      // Spawn new particles to maintain count
      const targetCount = isDarkMode ? 45 : 35
      while (particles.length < targetCount) {
        particles.push(createParticle())
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        // Horizontal oscillation
        p.x += p.vx + Math.sin(time * 0.0005 + p.phase) * 0.15
        p.y += p.vy

        // Remove if off-screen top
        if (p.y < -10) {
          particles.splice(i, 1)
          continue
        }

        // Pulsing alpha
        const pulse = 0.7 + 0.3 * Math.sin(time * 0.001 + p.phase)
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${p.color}, ${p.alpha * pulse})`
        ctx!.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)

    // Clear old particles on theme change and restart
    particles.length = 0
    raf = requestAnimationFrame(draw)

    // Pause when offscreen
    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting
        if (running) raf = requestAnimationFrame(draw)
      },
      { threshold: 0 }
    )
    io.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      io.disconnect()
    }
  }, [isDarkMode])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ mixBlendMode: isDarkMode ? 'screen' : 'normal' }}
    />
  )
}

/**
 * Aurora gradient blob that slowly drifts behind the hero content.
 * Uses CSS animation — no JS runtime cost.
 */
export function HeroAurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Primary aurora — teal to cyan */}
      <div className="hero-aurora hero-aurora--primary" />
      {/* Secondary aurora — violet */}
      <div className="hero-aurora hero-aurora--secondary" />
    </div>
  )
}
