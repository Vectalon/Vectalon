# Architecture and API design

# ADR-1: Architecture for: Create a login screen

Status: proposed
Date: 2026-08-06

## Context

We need to implement "Create a login screen" in the React Native project while following existing conventions and minimizing risk.

## Decision

Add dedicated API service module with hooks

## Options Considered

- Add dedicated API service module
- Inline API calls in components
- Use a state management library

## Consequences

- TBD

## References

- TBD


## API integration design

### Service module
- Create a feature-specific service under `src/services/`
- Encapsulate all endpoint calls
- Return typed responses and throw typed errors

### Hook layer
- Create a hook under `src/hooks/` for the feature logic
- Handles loading, error, and success states
- Keeps components focused on presentation

### Error handling
- Network errors: retry with exponential backoff
- Validation errors: surface field-level messages
- Auth errors: clear session and redirect to login