# Test writing

# Test-Driven Development — Tests written before implementation

Feature: add greet command

Acceptance criteria source: PRD / acceptance criteria captured

## Test files written (4)

- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/cli-app/src/__tests__/AddGreetCommand.tsx`
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/cli-app/src/__tests__/useAddGreetCommand.ts`
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/cli-app/src/__tests__/AddGreetCommandApi.ts`
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/cli-app/.maestro/AddGreetCommand.yaml`

## E2E flow

- `.maestro/AddGreetCommand.yaml` — Maestro E2E flow generated from the acceptance criteria (run with `maestro test` on a booted simulator/emulator)

## TDD Approach
1. These tests define the expected behavior BEFORE implementation.
2. The implementation phase must make these tests pass.
3. The verification phase re-runs the tests after code changes and reports failures.

## Next step
Run the implementation phase to generate code that satisfies these tests.