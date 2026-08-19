---
name: Vectalon
description: Adaptive AI harness for developers — an engineering control plane.
colors:
  primary: "#00E6C3"
  secondary: "#37B6FF"
  tertiary: "#8B5CF6"
  graphite: "#0B0F14"
  slate: "#151B26"
  off-white: "#F2F4F7"
typography:
  ui:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  display:
    fontFamily: "Inter, system-ui, sans-serif"
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

Vectalon is an adaptive AI harness for developers — an engineering control plane that understands, reviews, diagnoses, upgrades, and validates code. The design reflects precision, trust, and technical depth.

## Colors

### Brand Family
- **Electric Teal** (#00E6C3): Primary accent, CTAs, active states, the "live" indicator
- **Cyan Blue** (#37B6FF): Secondary accent, data highlights, links
- **Vivid Violet** (#8B5CF6): Tertiary accent, decorative depth, hover states
- **Off White** (#F2F4F7): Primary text, headings on dark backgrounds

### Surfaces
- **Graphite** (#0B0F14): Primary dark background (the ground)
- **Slate** (#151B26): Elevated surfaces, card interiors, panels

### Semantic Status
- **Emerald**: Pass / live / success
- **Amber**: Watch / in-progress
- **Red**: Alert / failure

## Typography

### Primary: Inter
UI text, body copy, navigation, buttons, headings. Clean, readable, professional.

### Secondary: JetBrains Mono
Code blocks, terminal output, CLI commands, technical labels. Monospace for precision.

### Hierarchy
- **Display** (700, clamp(2rem, 5vw, 3.4rem)): Hero headlines
- **Headline** (700, 36px): Section titles
- **Title** (600, 16px): Card titles, feature names
- **Body** (400, 15px): Paragraphs, descriptions
- **Code** (400, 13px): CLI commands, code blocks
- **Label** (600, 11px, uppercase): Status labels, metadata

## Layout

Single column, max-width 1152px (max-w-6xl). Sections separated by subtle borders. Spacing: 96px between major sections, 24px card padding.

## Elevation & Depth

Flat surfaces with subtle ambient shadows. Cards lift on hover with a soft glow in the brand teal color. No hard offset shadows.

## Shapes

Rounded corners at 12px for cards and panels, 8px for buttons and chips. Consistent, modern, approachable.

## Components

### Buttons
- **Primary**: Electric Teal fill, dark text, soft glow on hover
- **Ghost**: Bordered outline, light text, teal border on hover
- **Accent**: Cyan Blue fill, white text

### Cards
- Slate background, subtle border, 12px radius
- Hover: slight lift, border warms to teal

### Chips / Badges
- Bordered segments, 8px radius
- Status colors: emerald (pass), amber (watch), red (alert)

## Motion

- **Entrance**: fade-up animations with staggered delays
- **Hover**: subtle lift and border color transitions
- **Live indicator**: pulsing teal dot
- **Beam**: ambient teal-to-blue gradient sweep across the hero
- Respect `prefers-reduced-motion`

## Do's and Don'ts

### Do:
- Use Electric Teal for primary actions and active states
- Keep the design spacious and breathable
- Use Inter for all UI text
- Use JetBrains Mono for code and terminal content
- Maintain WCAG AA contrast ratios

### Don't:
- Use gradient text effects
- Add glassmorphism or excessive blur
- Overuse animations
- Mix too many accent colors in one section
- Create card-in-card-in-card layouts
