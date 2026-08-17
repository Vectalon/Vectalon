# Zustand for client state management

## Decision

Performance + simplicity. Zustand gives the screens a minimal, hook-first state store with no provider nesting, and its selectors re-render only the components that subscribe — the cart, checkout, and profile flows each read exactly the slice they need.

## Context

We evaluated Redux Toolkit, MobX, and Jotai. For a navigation-heavy app with per-screen data and a shared cart, Zustand's selector model keeps re-renders scoped and the learning curve near zero. The store is plain TypeScript — no boilerplate, no middleware stack — and it composes cleanly with the existing service layer.

## Status

Accepted March 2026

Approved by: Architecture Team

Related: Cart, Checkout, Profile
