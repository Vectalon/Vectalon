import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { SiteNav } from '../components/SiteNav'
import { MobileMenu } from '../components/MobileMenu'
import { ThemeToggle } from '../components/ThemeToggle'
import { PRODUCT_MANIFEST } from '../lib/product-manifest'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Vectalon — Adaptive AI harness for developers',
  description:
    'An engineering control plane that understands, reviews, diagnoses, upgrades, and validates code. 44 deterministic agents, zero model calls, no source leaves your machine.',
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

const animWatchdog = `
  (function () {
    function init() {
      try {
        var els = document.querySelectorAll('.animate-fade-up');
        if (!els.length) return;
        var done = false;
        function freeze() {
          if (!done) { done = true; document.documentElement.classList.add('anim-frozen'); }
        }
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
          if (!anyStillHidden()) { done = true; return; }
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: animWatchdog }} />
        <script dangerouslySetInnerHTML={{ __html: motionBudget }} />
        <script dangerouslySetInnerHTML={{ __html: revealObserver }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
        >
          Skip to content
        </a>
        {/* Header */}
        <header className="sticky top-0 z-40">
          <div className="statusline">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-stretch justify-between">
              <div className="flex items-stretch">
                <Link
                  href="/"
                  className="seg !px-5 font-bold tracking-tight text-slate-50 hover:!text-brand"
                >
                  {/* Vectalon logo mark */}
                  <svg width="22" height="24" viewBox="0 0 220 240" fill="none" className="shrink-0">
                    <path d="M25 48L70 70L110 195" stroke="url(#lg-teal)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M195 48L150 70L110 195" stroke="url(#lg-violet)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M55 112L110 195L165 112" stroke="#4DAEFF" strokeOpacity="0.9" strokeWidth="4" strokeLinecap="round"/>
                    <path d="M110 84V195" stroke="#39BFFF" strokeWidth="4" strokeLinecap="round"/>
                    <circle cx="55" cy="112" r="9" fill="#00E6C3"/>
                    <circle cx="165" cy="112" r="9" fill="#8B5CF6"/>
                    <circle cx="110" cy="84" r="8" fill="#37B6FF"/>
                    <circle cx="110" cy="195" r="11" fill="#37B6FF" stroke="#B8E8FF" strokeWidth="3"/>
                    <path d="M110 28L122 52H98L110 28Z" fill="#66E8FF"/>
                    <defs>
                      <linearGradient id="lg-teal" x1="20" y1="50" x2="110" y2="205" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#00E6C3"/>
                        <stop offset="1" stopColor="#37B6FF"/>
                      </linearGradient>
                      <linearGradient id="lg-violet" x1="200" y1="50" x2="110" y2="205" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#8B5CF6"/>
                        <stop offset="1" stopColor="#37B6FF"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  Vectalon
                </Link>
                <SiteNav />
              </div>
              <div className="flex items-stretch">
                <div className="seg hidden items-center gap-1.5 text-xs text-slate-500 md:flex">
                  <span className="text-brand">●</span>
                  <span className="hidden lg:inline">v{PRODUCT_MANIFEST.packages.reactNative.version}</span>
                </div>
                <MobileMenu />
                <ThemeToggle />
                <Link
                  href="/trial"
                  className="flex items-center bg-brand px-5 text-[13px] font-semibold text-on-brand transition hover:bg-brand-strong"
                >
                  Get started
                </Link>
              </div>
            </div>
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        {/* Footer */}
        <footer className="border-t border-ink-700/70 font-sans">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-[13px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <svg width="18" height="20" viewBox="0 0 220 240" fill="none" className="shrink-0 opacity-60">
                <path d="M25 48L70 70L110 195" stroke="url(#fl-teal)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M195 48L150 70L110 195" stroke="url(#fl-violet)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="110" cy="84" r="8" fill="#37B6FF"/>
                <defs>
                  <linearGradient id="fl-teal" x1="20" y1="50" x2="110" y2="205" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00E6C3"/><stop offset="1" stopColor="#37B6FF"/>
                  </linearGradient>
                  <linearGradient id="fl-violet" x1="200" y1="50" x2="110" y2="205" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8B5CF6"/><stop offset="1" stopColor="#37B6FF"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>Vectalon — Adaptive AI harness for developers</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/sdk/react-native" className="transition hover:text-brand">react-native</Link>
              <Link href="/sdk/ios" className="transition hover:text-brand">ios</Link>
              <Link href="/sdk/android" className="transition hover:text-brand">android</Link>
              <Link href="/sdk/flutter" className="transition hover:text-brand">flutter</Link>
            </div>
            <div className="flex gap-6">
              <a href="mailto:support@vectalon.in" className="transition hover:text-brand">support@vectalon.in</a>
              <Link href="/pricing" className="transition hover:text-brand">pricing</Link>
              <Link href="/docs" className="transition hover:text-brand">docs</Link>
            </div>
          </div>
          <div className="border-t border-ink-700/50">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 font-mono text-[11px] text-slate-600">
              <span>vectalon — an engineering control plane that understands, upgrades, and validates your code</span>
              <span className="hidden sm:inline">[ exit ]</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
