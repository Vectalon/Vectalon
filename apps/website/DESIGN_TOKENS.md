# Vectalon website — design tokens & rules

> Source of truth for the visual identity at vectalon.in. **Any agent working on
> apps/website must follow this document.** The palette lives in
> `tailwind.config.js` + `app/globals.css`; never hardcode brand hexes inline.

## Brand Family

| Role | Hex | Used for |
|---|---|---|
| Electric Teal | #00E6C3 | Primary CTAs, active states, live indicators, brand accent |
| Cyan Blue | #37B6FF | Secondary accent, data highlights, decorative |
| Vivid Violet | #8B5CF6 | Tertiary accent, depth, hover states |
| Graphite | #0B0F14 | Primary dark background |
| Slate | #151B26 | Elevated surfaces, card interiors |
| Off White | #F2F4F7 | Primary text on dark, headings |

## Typography

- **UI font**: Inter (via `--font-sans`). All body text, headings, buttons, navigation.
- **Code font**: JetBrains Mono (via `--font-mono`). CLI output, code blocks, terminal frames.

## Dual-mode theme (mandatory)

The site is **light/dark by system preference** — read by an inline bootstrap
script in `app/layout.tsx` that sets `data-theme="light|dark"` on `<html>`
before paint (no flash). The header **theme toggle** writes
`localStorage['vectalon-theme']` and flips `data-theme` live.

- **Never** write `text-white` / `text-black` for themeable copy — use
  `text-slate-50` (strong text token) or `text-slate-200` (body text).
- **Status colors** (emerald / amber / red) are semantic state, not brand.
- **State is never color alone:** every red/green/amber state carries a word
  or symbol (`✓ pass`, `◈ watch`, `● live`).

## Component rules

- **Cards**: `rounded-xl border border-ink-700 bg-ink-800 p-6`. Hover: translate-y-0.5, border-brand/50.
- **Buttons**: `rounded-lg` with brand/ghost/accent variants. Font: Inter semibold.
- **Chips**: `rounded-lg border border-ink-700 bg-ink-800/80 px-3 py-1.5 font-mono text-xs`.
- **Console frames**: `rounded-xl border border-ink-700 bg-ink-900/60`.
- **Statusline**: segmented bar, `divide-x divide-ink-700/70`, `bg-ink-900`.
- **Live indicator**: `inline-block h-1.5 w-1.5 rounded-full bg-brand` with pulse animation.
- **Icons**: `@phosphor-icons/react` (one family, `size={15-26}`).
- **Border radius**: Cards 12px, buttons/chips 8px. No sharp corners.
- **Elevation**: flat surfaces with ambient shadows. Cards lift on hover.
- **Motion**: `animate-fade-up` for entrance, `.caret` blink, `.live-dot` pulse, `.ticker` intel rerank. Respect `prefers-reduced-motion`.

## Validation

Before shipping UI changes: `pnpm typecheck`, `pnpm test`, `pnpm build`, and a
visual check in **both** modes (force via the data-theme attribute or system
theme).
