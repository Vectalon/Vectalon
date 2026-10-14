# Start here — Vectalon product direction

Before choosing work, read [the canonical product goal and execution plan](docs/release-roadmap/README.md), especially **Product direction and expansion gates** and **Next action and audit boundary**. Keep that file current; do not create competing roadmaps.

## Goal

Reduce the developer effort needed to complete verified engineering tasks with supported AI models. Prove this in React Native/Expo first, expand across mobile, then qualify other development ecosystems individually. Do not advertise future SDKs or universal model training as working capabilities.

## Current execution order

1. Record initial, retry, repair and selected benchmark outcomes separately.
2. Compare the same model on unseen tasks in one installed RN app, with and without Vectalon, under comparable budgets.
3. Extend existing reports into a visible improvement matrix; retain failures, skips, cost/time and evidence.
4. Fix measured weaknesses, scale evaluation to ten installed apps, and qualify the customer journey before a consolidated launch.

Core owns reusable contracts/context/safety primitives. This repo owns RN and future SDK adapters, verification, reports and the website. Admin owns authorized access and commercial lifecycle. Do not duplicate responsibilities or modify unrelated repo changes.

## Non-negotiable evidence rules

- Regression tests, fixture smoke, rubric scores and native task success are different evidence. Never substitute one for another.
- Keep held-out answers out of prompts/training exports. Report first-attempt and repair-assisted results separately.
- No fabricated model improvement, unverified human-reference claims, hidden failures or lowered thresholds to obtain green results.
- Generated source stays opt-in; never expose secrets or customer code by default.
- Prefer working vertical slices over extra commands, abstractions or documentation. Verify each slice and record remaining blockers.
- Batch package releases at qualified milestones; do not publish per task. Preserve valid customer grants and data.

The roadmap contains targets, not achieved results. No model can be forced to read instructions; these entry points guide tools that support repository instructions.
