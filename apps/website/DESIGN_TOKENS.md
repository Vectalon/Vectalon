# Vectalon website — design tokens & rules

> Source of truth for the visual identity at vectalon.in. **Any agent working on
> apps/website must follow this document.** The palette lives in
> `tailwind.config.js` + `app/globals.css`; never hardcode brand hexes inline.

## Brand Family

| Role | Hex | Used for |
|---|---|---|
| Terracotta | #E35336 | Primary CTAs, active states, live indicators, brand accent |
| Sandy Brown | #F4A460 | Secondary accent, data highlights, decorative |
| Sienna | #A0522D | Tertiary accent, depth, hover states |
| Beige Cream | #F5F5DC | Primary surface, light mode background |
| Warm Dark | #18120E | Dark mode primary background |
| Deep Warm | #261C14 | Dark mode elevated surfaces |

## Typography

- **Headings font**: Satoshi (via Fontshare). All display text, headings.
- **UI font**: Inter (via `--font-sans`). All body text, buttons, navigation.
- **Code font**: JetBrains Mono (via `--font-mono`). CLI output, code blocks, terminal frames.

## Dual-mode theme (mandatory)

The site is **light/dark by system preference** — read by an inline bootstrap
script in `app/layout.tsx` that sets a class on `<html>`
before paint (no flash). The header **theme toggle** writes
`localStorage['vectalon-theme']` and toggles the `.dark` class live.

- **Never** write `text-white` / `text-black` for themeable copy — use
  `text-slate-50` (strong text token) or `text-slate-200` (body text).
- **Status colors** (emerald / amber / red) are semantic state, not brand.
- **State is never color alone:** every red/green/amber state carries a word
  or symbol (`✓ pass`, `◈ watch`, `● live`).

## Light Mode Palette

| Token | RGB | Hex | Usage |
|---|---|---|---|
| `--brand` | 227 83 54 | #E35336 | Primary brand color |
| `--accent` | 244 164 96 | #F4A460 | Secondary accent |
| `--violet` | 160 82 45 | #A0522D | Tertiary/secondary |
| `--surface` | 245 245 220 | #F5F5DC | Page background |
| `--surface-elevated` | 250 248 232 | #FAF8E8 | Cards, panels |
| `--surface-deep` | 235 232 212 | #EBE8D4 | Subtle fills |
| `--fg` | 52 34 22 | #342216 | Primary text |
| `--fg-secondary` | 75 52 35 | #4B3423 | Body text |
| `--fg-muted` | 108 82 58 | #6C523A | Secondary text |
| `--border` | 200 185 160 | #C8B9A0 | Default borders |

## Dark Mode Palette

| Token | RGB | Hex | Usage |
|---|---|---|---|
| `--brand` | 238 102 72 | #EE6648 | Primary brand (brighter) |
| `--accent` | 244 164 96 | #F4A460 | Secondary accent |
| `--violet` | 185 108 62 | #B96C3E | Tertiary (lighter) |
| `--surface` | 24 18 14 | #18120E | Page background |
| `--surface-elevated` | 38 28 20 | #261C14 | Cards, panels |
| `--surface-deep` | 18 12 8 | #120C08 | Subtle fills |
| `--fg` | 245 238 225 | #F5EEE1 | Primary text |
| `--fg-secondary` | 228 218 200 | #E4DAC8 | Body text |
| `--fg-muted` | 195 182 162 | #C3B6A2 | Secondary text |
| `--border` | 58 42 30 | #3A2A1E | Default borders |

## Component rules

- **Cards**: `rounded-xl border border-frame bg-surface-elevated p-6`. Hover: translate-y-0.5, border-brand/50.
- **Buttons**: `rounded-lg` with brand/ghost/accent variants. Font: Satoshi/Inter semibold.
- **Chips**: `rounded-lg border border-frame bg-surface-deep/60 px-3 py-1.5 font-mono text-xs`.
- **Console frames**: `rounded-xl border border-frame bg-surface-elevated`.
- **Statusline**: segmented bar, `divide-x divide-frame/70`, `bg-surface-elevated`.
- **Live indicator**: `inline-block h-1.5 w-1.5 rounded-full bg-brand` with pulse animation.
- **Border radius**: Cards 12px, buttons/chips 8px. No sharp corners.
- **Elevation**: flat surfaces with ambient shadows. Cards lift on hover.
- **Motion**: `animate-fade-up` for entrance, `.caret` blink, `.live-dot` pulse, `.ticker` intel rerank. Respect `prefers-reduced-motion`.

## Validation

Before shipping UI changes: `pnpm typecheck`, `pnpm test`, `pnpm build`, and a
visual check in **both** modes (force via the theme toggle or system preference).
