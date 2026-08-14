# Vectalon website — design tokens & rules (THE CONSOLE)

> Source of truth for the visual identity at vectalon.in. **Any agent working on
> apps/website must follow this document.** The palette lives in
> `tailwind.config.js` + `app/globals.css`; never hardcode brand hexes inline.
> See also `DESIGN.md` (the full system record) and `PRODUCT.md` (product truth).

## World: THE CONSOLE

The site is a terminal. Statusline header, framed panes, JetBrains Mono
everywhere, prompt-driven actions. Two themes, both native to a terminal:

- **Phosphor (dark, default):** console ground `rgb(13 15 12)`, pane surface
  `rgb(25 29 23)`, frame borders `rgb(45 51 41)`, body ink `rgb(226 224 210)`.
- **Paper (light):** ground `rgb(245 243 234)`, pane `rgb(250 248 239)`, frames
  `rgb(214 209 192)`, ink `rgb(58 62 53)`.

All colors are CSS-variable triplets resolved per theme in `globals.css`.
`slate-*` is a neutral text scale that inverts per mode (light = paper ink,
dark = console ink). Use `text-slate-200` for body, `text-slate-400` for
secondary, `text-slate-500` for meta — they read correctly in both modes and
hold WCAG AA on their surfaces (do not lighten them further).

## Brand family

| Role | Dark | Light | Used for |
|---|---|---|---|
| Vermilion | `rgb(227 83 54)` | `rgb(196 62 30)` | `$` prompt, primary CTAs, active window, logo mark |
| Sand (hover) | `rgb(240 158 74)` | `rgb(160 78 28)` | `--brand-strong` hover fills |
| Phosphor green | `rgb(74 222 128)` | `rgb(30 120 68)` | guardrail pass, "go" actions, live dots |
| Terminal black | `rgb(20 23 18)` | same | the product terminal livery (fixed in both modes) |

## Dual-mode theme (mandatory)

The site is **light/dark by system preference** — read by an inline bootstrap
script in `app/layout.tsx` that sets `data-theme="light|dark"` on `<html>`
before paint (no flash). The header **theme toggle** writes
`localStorage['vectalon-theme']` and flips `data-theme` live.

- **Never** write `text-white` / `text-black` for themeable copy — use
  `text-slate-50` (strong text token: near-black in light, near-white in dark).
- **Status colors** (emerald / amber / red) are semantic state, not brand.
  Always pair them with `dark:` variants
  (`text-emerald-700 dark:text-emerald-400` etc.) so they hold contrast in
  both modes. Tailwind `dark:` is configured as
  `['selector', '[data-theme="dark"]']`.
- **State is never color alone:** every red/green/amber state carries a word
  or symbol (`✓ pass`, `◈ watch`, `● live`).

## Component rules

- **Typography is JetBrains Mono only.** `--font-display` maps to the mono
  face (set in `globals.css`), so `font-display` = `font-mono`. Hierarchy comes
  from weight/size/color, never a second family.
- **Everything is a pane or a statusline.** Content blocks use `.card`
  (3px radius, `border-ink-700`, `bg-ink-800`) or `.console` / `.term` frames.
  `─── title ───` headers come from `.pane-head` (::before/::after rules).
- **Terminals stay dark in both modes.** The CLI is the product, so `.term`
  frames, `pre` blocks with CLI content, and the hero console keep the fixed
  terminal livery (`rgb(20 23 18)` + `rgb(58 64 50)` border) in both themes.
- **Buttons:** `.btn-primary` = vermilion + near-black text; `.btn-accent` =
  phosphor green + near-black; `.btn-ghost` = bordered outline. Text on a
  button must use `on-brand` / `on-accent` tokens — never a hardcoded hex.
- **Icons:** `@phosphor-icons/react` only (one family, `size={15-26}`,
  `className="text-brand"`). No emoji in marketing copy — terminal glyphs
  (`✓ ◆ ✦ ● ○ ◈ ▸`) are the console's native punctuation and are allowed in
  console chrome; replace decorative emoji with icon glyphs.
- **Radius scale:** one sharp scale — cards/buttons/inputs/chips 3px,
  consoles 4px. No pills (chips are bracketed segments, not pills).
- **Elevation:** flat phosphor; consoles carry one soft ambient shadow
  (`0 24px 70px -30px rgb(0 0 0 / 0.55)`), buttons bloom vermilion only on
  hover. No hard offset shadows, no gradient text, no glass except the sticky
  header's functional backdrop blur.
- **Eyebrow restraint:** no marketing eyebrows above headings. `.pane-head`
  labels are window titles (functional chrome), not eyebrows — keep it that
  way; do not stack a label above a headline.
- **Motion:** `animate-fade-up` for entrance, `.caret` blink, `.live-dot`
  pulse, `.ticker` intel rerank (22s, pause on hover, first copy always
  visible, duplicate copy `aria-hidden`). Respect `prefers-reduced-motion`
  (guarded in globals.css).
- **Copy:** use em dashes (—), never middle dots (`·`) in marketing copy. `·`
  inside terminal output or monospace CLI text is fine and authentic.

## Validation

Before shipping UI changes: `pnpm typecheck`, `pnpm test`, `pnpm build`, and a
visual check in **both** modes (force via the data-theme attribute or system
theme).
