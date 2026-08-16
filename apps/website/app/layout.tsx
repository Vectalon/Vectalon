import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { SiteNav } from '../components/SiteNav'
import { MobileMenu } from '../components/MobileMenu'
import { ThemeToggle } from '../components/ThemeToggle'

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Vectalon — the AI engineering control plane for React Native',
  description:
    'Give Vectalon a React Native repository and it continuously understands, reviews, diagnoses, upgrades, and validates the application — 44 deterministic agents, zero model calls, no source leaves your machine.',
}

const themeScript = `
  (function () {
    try {
      var t = localStorage.getItem('vectalon-theme');
      if (t !== 'light' && t !== 'dark') {
        t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
  })();
`

// Watchdog for entrance animations (animate-fade-up): those start at
// opacity 0 with fill-mode both, so if the compositor never advances
// the animation (throttled/non-composited webviews, energy saver,
// screenshots), the hero content — including the console text — stays
// invisible against the dark page. Detect that and add html.anim-frozen
// so globals.css strips the animations and content is always visible.
const animWatchdog = `
  (function () {
    function init() {
      try {
        var els = document.querySelectorAll('.animate-fade-up');
        if (!els.length) return;
        var done = false;
        function freeze() {
          if (!done) {
            done = true;
            document.documentElement.classList.add('anim-frozen');
          }
        }
        // Entrance animations use fill-mode both, so every element parks at
        // the opacity-0 start frame until its own delay elapses. The first
        // element (no delay) finishing is NOT proof the rest are fine: when
        // the compositor stalls (screenshot capture, energy saver, throttled
        // webview), the delayed elements — subtext, CTA buttons — stay
        // invisible forever. Sample ALL of them.
        var maxDelay = 0;
        for (var i = 0; i < els.length; i++) {
          var d = parseFloat(window.getComputedStyle(els[i]).animationDelay) || 0;
          if (d > maxDelay) maxDelay = d;
        }
        function anyStillHidden() {
          for (var i = 0; i < els.length; i++) {
            if (parseFloat(window.getComputedStyle(els[i]).opacity) <= 0.05) return true;
          }
          return false;
        }
        function sample() {
          if (done) return;
          if (!anyStillHidden()) {
            done = true; // animations are advancing normally
            return;
          }
          window.requestAnimationFrame(sample);
        }
        window.setTimeout(function () {
          if (anyStillHidden()) freeze();
        }, maxDelay * 1000 + 900);
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(sample);
        }
      } catch (e) {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
`

// Motion budget: pause decorative loops (the hero beam) while they are
// offscreen. A transform-only loop is cheap, but an infinite animation the
// user cannot see should not keep running — pause on exit, resume on return.
const motionBudget = `
  (function () {
    if (!('IntersectionObserver' in window)) return;
    function init() {
      var els = document.querySelectorAll('.js-loop');
      if (!els.length) return;
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          entries[i].target.style.animationPlayState = entries[i].isIntersecting ? 'running' : 'paused';
        }
      }, { threshold: 0 });
      for (var i = 0; i < els.length; i++) io.observe(els[i]);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
`

// Scroll reveals (.reveal): below-fold surfaces (agents cards, report
// windows, homepage sections) enter as they scroll into view instead of
// playing their entrance off-screen at load. The hidden state only exists
// under html.js-reveal — added here, so a no-JS client sees everything
// immediately. Each element is revealed once (unobserved after); the
// classes are stripped after the transition so the element returns to its
// natural styles (hover lifts, theme crossfades). A stalled-compositor
// safety net mirrors the fade-up watchdog, but checks only reveal
// elements that are actually in the viewport — below-fold ones are
// legitimately hidden until scrolled to.
const revealObserver = `
  (function () {
    function inViewport(el) {
      var r = el.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      return r.top < vh && r.bottom > 0;
    }
    function init() {
      try {
        var els = document.querySelectorAll('.reveal');
        if (!els.length) return;
        if (!('IntersectionObserver' in window)) return;
        document.documentElement.classList.add('js-reveal');
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              reveal(entries[i].target);
              io.unobserve(entries[i].target);
            }
          }
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
        for (var i = 0; i < els.length; i++) io.observe(els[i]);
        // Stalled-compositor net: if any in-viewport reveal never became
        // visible after its max delay plus margin, freeze — globals.css
        // strips the hidden state under html.anim-frozen.
        var maxDelay = 0;
        for (var i = 0; i < els.length; i++) {
          var d = parseFloat(window.getComputedStyle(els[i]).transitionDelay) || 0;
          if (d > maxDelay) maxDelay = d;
        }
        window.setTimeout(function () {
          for (var i = 0; i < els.length; i++) {
            if (inViewport(els[i]) && parseFloat(window.getComputedStyle(els[i]).opacity) <= 0.05) {
              document.documentElement.classList.add('anim-frozen');
              return;
            }
          }
        }, maxDelay * 1000 + 900);
      } catch (e) {}
    }
    function reveal(el) {
      el.classList.add('is-revealed');
      var delay = 0;
      try {
        delay = parseFloat(window.getComputedStyle(el).transitionDelay) || 0;
      } catch (e) {}
      window.setTimeout(function () {
        el.classList.remove('reveal');
        el.classList.remove('is-revealed');
      }, delay * 1000 + 600);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
`

// The direction contract for this build — emitted into the HTML so a
// production build can be audited against it (grep the built output).
const directionContract = `<!--
  THE CONSOLE — vectalon.in
  THESIS: The site is a terminal. The audience runs Vectalon in a terminal,
  so the site speaks that language: statuslines, framed panes, mono type,
  prompt-driven actions. It refuses the dark-hero-with-glow category default
  by making the darkness itself the product's own console.
  OWN-WORLD: phosphor console (dark) / paper console (light) ground; vermilion
  prompt + primary action, phosphor-green guardrail pass; JetBrains Mono
  everywhere; every content block is a bordered pane; the header is a tmux
  statusline; the product's own terminal frames stay dark in both modes.
  STORY: A first-time visitor reads a running session of their own workflow —
  intel feed reranking, guardrails passing, the healing log — then types the
  one command that starts it, and believes the harness is real because it
  looks and reads like the tool it will actually use.
  FIRST VIEWPORT: A full-bleed console. Statusline: "vectalon main · bench
  90% · intel 26 live". Headline in mono display type. Three panes (intel
  feed, guardrails, healing log). Prompt line with a blinking caret is the
  primary action, with "See it run" beside it.
  FORM: THE CONSOLE, the model-pick grounded direction (TUI dashboard
  culture), chosen by the user over the assigned roll (THE DIFF); seed key
  392023ca.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md
-->`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: animWatchdog }} />
        <script dangerouslySetInnerHTML={{ __html: motionBudget }} />
        <script dangerouslySetInnerHTML={{ __html: revealObserver }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <div dangerouslySetInnerHTML={{ __html: directionContract }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[3px] focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
        >
          Skip to content
        </a>
        {/* Statusline header */}
        <header className="sticky top-0 z-40">
          <div className="statusline">
            <div className="mx-auto flex h-12 w-full max-w-6xl items-stretch justify-between">
              <div className="flex items-stretch">
                <Link
                  href="/"
                  className="seg !px-4 font-bold tracking-tight text-slate-50 hover:!text-brand"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-[3px] bg-brand text-xs font-black text-on-brand">
                    ▣
                  </span>
                  vectalon<span className="text-brand">.in</span>
                </Link>
                <SiteNav />
              </div>
              <div className="flex items-stretch">
                <div className="seg hidden text-xs text-slate-500 md:flex">
                  <span className="text-emerald-600 dark:text-emerald-400">●</span>
                  main · v0.12.0
                </div>
                <MobileMenu />
                <ThemeToggle />
                <Link
                  href="/trial"
                  className="flex items-center bg-brand px-4 text-[13px] font-semibold text-on-brand transition hover:bg-brand-strong"
                >
                  Get started
                </Link>
              </div>
            </div>
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        {/* Console footer */}
        <footer className="border-t border-ink-700/70 font-mono">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[13px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <div>
              vectalon<span className="text-brand">.in</span>
              <span className="text-slate-500"> — Business Source License</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/sdk/react-native" className="transition hover:text-brand">
                react-native
              </Link>
              <Link href="/sdk/ios" className="transition hover:text-brand">
                ios
              </Link>
              <Link href="/sdk/android" className="transition hover:text-brand">
                android
              </Link>
              <Link href="/sdk/flutter" className="transition hover:text-brand">
                flutter
              </Link>
            </div>
            <div className="flex gap-6">
              <a href="mailto:support@vectalon.in" className="transition hover:text-brand">
                support@vectalon.in
              </a>
              <Link href="/pricing" className="transition hover:text-brand">
                pricing
              </Link>
              <Link href="/docs" className="transition hover:text-brand">
                docs
              </Link>
            </div>
          </div>
          <div className="border-t border-ink-700/50">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 font-mono text-[11px] text-slate-600">
              <span>vectalon — a local agent that never works from a guess</span>
              <span className="hidden sm:inline">[ exit ]</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
