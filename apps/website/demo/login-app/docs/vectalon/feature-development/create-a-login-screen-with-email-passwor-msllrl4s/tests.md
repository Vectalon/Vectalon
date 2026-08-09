# Test writing

# Test-Driven Development — Tests written before implementation

Feature: create a login screen with email password

Acceptance criteria source: PRD / acceptance criteria captured

## Test files written (4)

- `/private/tmp/vectalon-demo/login-app/src/__tests__/CreateLoginScreenEmailPassword.tsx`
- `/private/tmp/vectalon-demo/login-app/src/__tests__/useCreateLoginScreenEmailPassword.ts`
- `/private/tmp/vectalon-demo/login-app/src/__tests__/CreateLoginScreenEmailPasswordApi.ts`
- `/private/tmp/vectalon-demo/login-app/.maestro/CreateLoginScreenEmailPassword.yaml`

## E2E flow

- `.maestro/CreateLoginScreenEmailPassword.yaml` — Maestro E2E flow generated from the acceptance criteria (run with `maestro test` on a booted simulator/emulator)

## TDD Approach
1. These tests define the expected behavior BEFORE implementation.
2. The implementation phase must make these tests pass.
3. The verification phase re-runs the tests after code changes and reports failures.

## Next step
Run the implementation phase to generate code that satisfies these tests.