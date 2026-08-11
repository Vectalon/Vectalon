# Vectalon website — design tokens & rules

> Source of truth for the visual identity at vectalon.in. **Any agent working on
> apps/website must follow this document.** The palette lives in
> `tailwind.config.js` + `app/globals.css`; never hardcode brand hexes inline.

## Brand family

| Role | Hex | Light mode | Dark mode |
|---|---|---|---|
| Vermilion | `#E35336` | `--accent` (CTA fills) | `--accent` (CTA fills) |
| Cream | `#F5F5DC` | `--on-accent` | `--brand` (links, buttons, values) |
| Sand | `#F4A460` | `--brand-strong` (hovers) | `--brand-strong` (hovers) |
| Sienna | `#A0522D` | — | `--on-brand` (text on cream) |

## Dual-mode theme (mandatory)

The site is **light/dark by system preference** — `prefers-color-scheme`, read by an
inline bootstrap script in `app/layout.tsx` that sets `data-theme="light|dark"` on
`<html>` before paint (no flash). The header **theme toggle** (`components/ThemeToggle.tsx`)
overrides the system preference by writing `localStorage['vectalon-theme']` and flipping
`data-theme` live — the bootstrap script already honors that key on next load.

- **Light**: white page (`--ink: 255 255 255`), warm-dark text, vermilion accents
  (darkened variants so links/buttons pass WCAG AA on white).
- **Dark**: near-black page (`--ink: 13 12 10`), cream text, cream/sand accents.
- All colors are **CSS-variable triplets** resolved per theme in `globals.css`.
  `slate-*` is a neutral scale that **inverts per mode** (light = warm-dark text,
  dark = warm-light text). Use `text-slate-200` for body, `text-slate-400` for
  secondary, `text-slate-500` for meta — they read correctly in both modes.
- **Never** write `text-white` / `text-black` for themeable copy — use `text-slate-50`
  (strong text token: near-black in light, near-white in dark).
- **Status colors** (emerald / amber / red) are semantic state, not brand. Always pair
  them with `dark:` variants: `text-emerald-700 dark:text-emerald-300` etc. so they hold
  contrast in both modes. Tailwind `dark:` is configured as
  `['selector', '[data-theme="dark"]']`.

## Component rules

- **Terminals stay dark in both modes.** The CLI is the product, so terminal frames,
  `pre` blocks with CLI content, and the hero terminal use the fixed `.term` / `.term-head`
  / `.term-body` classes (sienna-black `#221409`, cream mono text). Don't tokenize them.
- **Buttons:** `.btn-primary` = brand bg + `text-on-brand`; `.btn-accent` = vermilion +
  `text-on-accent`; `.btn-ghost` = bordered outline. Text on a button must use the
  `on-brand` / `on-accent` tokens — never a hardcoded hex.
- **Icons:** `@phosphor-icons/react` only (one family, `size={26}`, `className="text-brand"`).
  No emoji in marketing copy — replace with icon glyphs.
- **Radius scale:** sharp-ish, one scale — cards `rounded-xl`, inputs/buttons `rounded-md`,
  small code `rounded-lg`, bars `rounded-[3px]`. No pills except `.chip` (tags) and `.badge`.
- **Eyebrow restraint:** at most one uppercase-tracking `micro` label per three sections.
  Prefer the headline alone.
- **Hero discipline:** max 4 text elements (eyebrow / headline / subtext / CTAs), subtext
  ≤ 20 words, CTAs visible without scroll, top padding ≤ `pt-24`. No taglines under CTAs.
- **Copy:** use em dashes (—), never middle dots (`·`) in marketing copy. `·` inside
  terminal output or monospace CLI text is fine and authentic.
- **Motion:** `animate-fade-up` for entrance, `.caret` blink. Respect
  `prefers-reduced-motion` (guarded in globals.css).
- **Layout families:** a layout family (card grid, split, timeline, bento) appears at most
  once per page; vary between sections.

## Validation

Before shipping UI changes: `pnpm typecheck`, `pnpm test`, `pnpm build`, and a visual
check in **both** modes (force via the data-theme attribute or system theme).
