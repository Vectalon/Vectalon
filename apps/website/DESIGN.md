---
name: Vectalon
description: Adaptive AI harness for developers — an engineering control plane.
colors:
  primary: "#E35336"
  surface: "#F5F5DC"
  accent: "#F4A460"
  secondary: "#A0522D"
  graphite-dark: "#1A120E"
  warm-dark: "#261C14"
typography:
  headings:
    fontFamily: "Satoshi, system-ui, sans-serif"
  ui:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  display:
    fontFamily: "Satoshi, Inter, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  card: "12px"
  button: "8px"
  chip: "8px"
spacing:
  section: "96px"
  card-pad: "24px"
---

# Design System: Vectalon — Adaptive AI Harness

## Overview

Vectalon is an adaptive AI harness for developers — an engineering control plane that understands, reviews, diagnoses, upgrades, and validates code. The design reflects warmth, precision, and trust through an earthy terracotta palette.

## Colors

### Brand Family
- **Terracotta** (#E35336): Primary brand, CTAs, active states, the "live" indicator
- **Sandy Brown** (#F4A460): Secondary accent, data highlights, decorative
- **Sienna** (#A0522D): Tertiary accent, depth, hover states, dark mode text
- **Beige Cream** (#F5F5DC): Primary surface, light mode background

### Surfaces
- **Beige Cream** (#F5F5DC): Light mode primary background
- **Warm Cream** (#FAF8E8): Light mode elevated surfaces
- **Warm Dark** (#18120E): Dark mode primary background
- **Deep Warm** (#261C14): Dark mode elevated surfaces

### Semantic Status
- **Emerald**: Pass / live / success
- **Amber**: Watch / in-progress
- **Red**: Alert / failure

## Typography

### Primary: Satoshi (Headings)
Used for all headings and display text. Bold, distinctive, modern.

### Secondary: Inter
UI text, body copy, navigation, buttons. Clean, readable, professional.

### Tertiary: JetBrains Mono
Code blocks, terminal output, CLI commands, technical labels. Monospace for precision.

### Hierarchy
- **Display** (Satoshi 700, clamp(2rem, 5vw, 3.4rem)): Hero headlines
- **Headline** (Satoshi 700, 36px): Section titles
- **Title** (Satoshi 600, 16px): Card titles, feature names
- **Body** (Inter 400, 15px): Paragraphs, descriptions
- **Code** (JetBrains Mono 400, 13px): CLI commands, code blocks
- **Label** (Inter 600, 11px, uppercase): Status labels, metadata

## Layout

Single column, max-width 1152px (max-w-6xl). Sections separated by subtle borders. Spacing: 96px between major sections, 24px card padding.

## Elevation & Depth

Flat surfaces with subtle ambient shadows. Cards lift on hover with a soft glow in the brand terracotta color. No hard offset shadows.

## Shapes

Rounded corners at 12px for cards and panels, 8px for buttons and chips. Consistent, modern, approachable.

## Components

### Buttons
- **Primary**: Terracotta fill, cream text, soft glow on hover
- **Ghost**: Bordered outline, warm text, terracotta border on hover
- **Accent**: Sandy Brown fill, dark text

### Cards
- Warm cream background, subtle border, 12px radius
- Hover: slight lift, border warms to terracotta

### Chips / Badges
- Bordered segments, 8px radius
- Status colors: emerald (pass), amber (watch), red (alert)

## Motion

- **Entrance**: fade-up animations with staggered delays
- **Hover**: subtle lift and border color transitions
- **Live indicator**: pulsing terracotta dot
- **Beam**: ambient terracotta-to-sandy-brown gradient sweep across the hero
- Respect `prefers-reduced-motion`

## Do's and Don'ts

### Do:
- Use Terracotta for primary actions and active states
- Keep the design spacious and breathable
- Use Satoshi for headings, Inter for body text
- Use JetBrains Mono for code and terminal content
- Maintain WCAG AA contrast ratios

### Don't:
- Use gradient text effects (except hero gradient)
- Add glassmorphism or excessive blur
- Overuse animations
- Mix too many accent colors in one section
- Create card-in-card-in-card layouts
