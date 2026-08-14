---
name: Vectalon
description: The AI harness that lives in your terminal — the site is a console.
colors:
  primary: "#E35336"
  phosphor-green: "#4ADE80"
  console-ground: "#0D0F0C"
  console-pane: "#191D17"
  console-frame: "#2D3329"
  console-ink: "#E2E0D2"
  console-meta: "#7C8671"
  paper-ground: "#F5F3EA"
  paper-ink: "#3A3E35"
  paper-secondary: "#686D5C"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(2rem, 5vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  body:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.12em"
    textTransform: "uppercase"
  micro:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "normal"
  console-meta:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "normal"
  term:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  pane: "3px"
  console: "4px"
spacing:
  pane-pad: "24px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.console-ground}"
    rounded: "{rounded.pane}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.console-ink}"
    rounded: "{rounded.pane}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.console-pane}"
    textColor: "{colors.console-ink}"
    rounded: "{rounded.pane}"
    padding: "24px"
  chip:
    backgroundColor: "{colors.console-pane}"
    textColor: "{colors.console-meta}"
    rounded: "{rounded.pane}"
---

# Design System: Vectalon — THE CONSOLE

## Overview

**Creative North Star: "THE CONSOLE"**

The site is a terminal. The audience runs Vectalon in a terminal, so the website speaks that language end to end: a tmux-style statusline header, every content block a framed pane, JetBrains Mono everywhere, and a blinking prompt as the primary action. The darkness is not an overlay — it is the product's own console, structured by statuslines, pane borders, live indicators, and phosphor accents. The category default (a dark hero with a gradient glow over a screenshot, three feature cards, a pricing grid) is refused: the visitor instead reads a running session of their own workflow — the intel feed reranking, guardrails passing, the healing log — and then types the one command that starts it.

The world has two themes, both native to a terminal: **phosphor** (dark, the default) and **paper** (a terminal in daylight). The product's own terminal frames stay dark in both modes — a terminal inside a terminal.

**Key Characteristics:**
- Monospace-only typography; the display voice is the terminal face.
- Statuslines with segmented, divided bars carry navigation, state, and metrics.
- Every content block is a bordered pane with a `─── title ───` header rule.
- Vermilion is the prompt and the primary action; phosphor green is the guardrail pass / go state.
- Live state is shown honestly: blinking phosphor dots and a reranking intel ticker.
- Sharp corners (3–4px), flat phosphor surfaces, one soft ambient shadow on frames.

## Colors

Two theme sets over one role map; status colors (emerald/amber/red) are semantic and always carry `dark:` variants.

### Primary
- **Vermilion Prompt** (#E35336, dark: rgb 227 83 54 / light: rgb 196 62 30): the `$` prompt, primary CTAs, active window, logo mark. In light it darkens to pass WCAG AA on paper.

### Secondary
- **Phosphor Green** (#4ADE80, dark: rgb 74 222 128 / light: rgb 30 120 68): guardrail pass, "go" actions (waitlist), live-dot indicators. Text on green is near-black (rgb 8 12 9).

### Neutral
- **Console Ground** (#0D0F0C, rgb 13 15 12): the dark page surface.
- **Console Pane** (#191D17, rgb 25 29 23): pane interiors, cards.
- **Console Frame** (#2D3329, rgb 45 51 41): pane and console borders.
- **Console Ink** (#E2E0D2, rgb 226 224 210): body text on the console ground.
- **Console Meta** (#7C8671, rgb 124 134 113): secondary/meta text (AA on the console ground).
- **Paper Ground / Ink / Secondary** (#F5F3EA, #3A3E35, #686D5C): the light theme's surface and text (AA on paper).
- **Terminal Black** (rgb 20 23 18, border rgb 58 64 50): the fixed `.term` livery, identical in both themes.

### Named Rules
**The Prompt Rule.** Vermilion is the prompt, not a decoration: it marks the `$`, the active action, and the cursor. It appears as text and as filled action blocks, never as arbitrary highlights.
**The State Word Rule.** Color never carries state alone — every red/green/amber state also carries a word or symbol (`✓ pass`, `◈ watch`, `● live`).

## Typography

**Display Font:** JetBrains Mono (self-hosted via next/font; `--font-display` maps to the mono face).
**Body Font:** JetBrains Mono (via `--font-mono`).
**Label/Mono Font:** the same face — there is only one face.

**Character:** Teletype. The site types in the same face as the CLI it sells; hierarchy comes from weight, size, and color, not from a second family.

### Hierarchy
- **Display** (700, clamp(2rem, 5vw, 3.4rem), 1.08): hero and section headlines, mono poster scale, tracking -0.02em.
- **Headline** (700, 30px): section titles.
- **Title** (600, 16px): pane and feature titles.
- **Body** (400, 14px, 1.6): paragraphs, ~65ch max.
- **Label** (600, 11px, 0.12em, uppercase): pane headers, statusline meta, stat labels.

## Layout

A single column over a 1152px (max-w-6xl) container; sections separated by full-width hairline rules (`border-t border-ink-700/70`). The page is one long terminal session: the hero console, then the platform strip, the workflow session, the demo, the benchmark statusline, the feature panes, the intel pane, and a closing install console.

Density is terminal-tight: pane padding 16–24px, section padding 80px, generous air above headings (one spacing rhythm, more space above a heading than below). The sticky statusline header is 48px tall with segments divided by hairlines. Responsive: panes collapse to a single column under `md`, the statusline hides nav segments under `lg` (segments remain in the ProductsMenu), and tickers keep their first rows visible.

## Elevation & Depth

Flat phosphor surfaces; depth comes from frames, not shadows. Frames carry one soft ambient shadow (`0 24px 70px -30px rgb(0 0 0 / 0.55)` with a 1px inner highlight) so consoles lift off the ground; buttons glow faintly vermilion only on hover (`0 0 26px -10px var(--glow-brand)`). Nothing casts a hard offset shadow.

## Shapes

Sharp corners, one scale: panes, cards, buttons, inputs, chips all 3px; consoles (the hero and big frames) 4px. No pills except none — chips are bracketed segments with square corners. The signature shape is the `─── title ───` pane header: a centered label flanked by hairlines, drawn with `::before`/`::after` rules.

## Components

### Buttons
- **Shape:** flat blocks, 3px radius, mono type.
- **Primary:** vermilion fill, near-black text (`bg-brand text-on-brand`), hover fills sand-dark with a faint vermilion bloom.
- **Ghost:** bordered (`border-ink-700`), ink text, hover shifts border and text to vermilion.
- **Accent (go):** phosphor-green fill, near-black text, used for waitlist/join actions.

### Chips
- **Style:** bordered segments (`border-ink-700`, pane surface), bracketed feel, mono 12px; used for SDK status (`● live` / `○ soon`) and code tags.

### Cards / Containers
- **Corner Style:** 3px.
- **Background:** pane surface (`bg-ink-800`).
- **Border:** one 1px frame (`border-ink-700`).
- **Padding:** 24px (16px in dense panes).
- **Shadow Strategy:** none at rest; hover lifts the card 2px and warms the border to vermilion.

### Console & Terminal frames
- `.console`: the big hero/session frame — 4px radius, pane-900 interior, dark in both themes; `.console-head` carries a frame title and a live indicator.
- `.term`: the product terminal — fixed dark livery (`rgb(20 23 18)` + `rgb(58 64 50)` border) in both themes, with traffic-light dots and a `[title]` bar.

### Statusline (Navigation)
- A 48px tmux-style bar: segments divided by hairlines; logo left, nav center, theme toggle + "main · v0.5.0" + Get started right. Nav items hover to vermilion; the CTA is a solid vermilion block.

### Signature Component: The Live Ticker
A vertical feed of intel rows (RN 0.87-rc · GitHub Atom …) that reranks continuously by translating a duplicated list 22s/loop, pausing on hover. The first copy is the accessible content (the duplicate is `aria-hidden`); reduced-motion renders it static. Paired with a blinking `.live-dot` (phosphor green) that marks genuinely live state.

## Do's and Don'ts

### Do:
- **Do** keep the world monospace — one face, hierarchy by weight/size/color.
- **Do** frame content: a bordered pane or a statusline, never a floating card on the bare ground.
- **Do** carry every state as word-plus-color (`✓ pass`, `◈ watch`), never color alone.
- **Do** use vermilion as the prompt/action and phosphor green as pass/go, and nothing else in those roles.
- **Do** keep the product terminal (`.term`) dark in both themes.
- **Do** respect `prefers-reduced-motion`: ticker, caret, and live-dot collapse to static.

### Don't:
- **Don't** reintroduce a gradient hero, glow behind the headline, or a screenshot inside a dark frame with no structure — the console IS the structure.
- **Don't** use non-mono display faces; the display voice is the terminal face.
- **Don't** use pills for cards or buttons — corners stay at 3–4px.
- **Don't** let secondary/meta text drop below WCAG AA on its surface (light theme: keep paper-secondary dark; dark theme: keep console-meta ≥ rgb 124 134 113).
- **Don't** animate content invisible-by-default; the ticker's first copy must always be visible.
