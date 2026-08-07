# Code review

# Code Review Report

**Summary:** 0 error(s), 0 warning(s), 7 info note(s)
**Files reviewed:** 3
**Heal policy:** 3 attempt(s), severity ≥ error, tool checks on
**Reviewer:** rule-based analyzer (LLM unavailable)

✅ All files passed code review. No issues found.

## Rules checked
🔴 `no-eval` — errors: Avoid eval() and new Function() — severe security risk.
🔴 `no-inner-html` — errors: Avoid innerHTML and dangerouslySetInnerHTML — XSS risk.
🔴 `no-hardcoded-secrets` — errors: Remove hardcoded API keys, tokens, or passwords.
🟡 `no-http-url` — warnings: Use https:// instead of http:// for network requests.
🟡 `no-any` — warnings: Avoid the any type; use a concrete type or unknown.
🟡 `no-non-null-assertion` — warnings: Avoid non-null assertions (!); add null checks instead.
🟡 `no-ts-ignore` — warnings: Replace @ts-ignore with a typed fix or @ts-expect-error with justification.
🟡 `no-implicit-any-param` — warnings: Add explicit types to function parameters.
🟡 `no-console-log` — warnings: Remove console.log / console.debug before merging.
🔴 `missing-key-prop` — errors: Array .map() must include a unique key prop for each element.
🔵 `inline-style` — infos: Prefer StyleSheet.create over inline style={{...}} for performance.
🔴 `direct-state-mutation` — errors: Never mutate state directly; always use the setter function.
🔴 `set-state-in-render` — errors: Do not call setState during the render phase (use useEffect).
🟡 `missing-use-effect-cleanup` — warnings: useEffect subscriptions, timers, or listeners should return a cleanup function.
🟡 `use-effect-missing-deps` — warnings: useEffect dependency array may be missing values used inside.
🟡 `missing-accessibility` — warnings: Interactive elements should have accessibilityLabel and accessibilityRole.
🟡 `inline-deps-object` — warnings: Avoid creating new objects/arrays inside useEffect/useCallback dependency arrays — causes unnecessary re-runs.
🟡 `var-usage` — warnings: Use let or const instead of var.
🟡 `loose-equality` — warnings: Use strict equality (=== / !==) instead of == / !=.
🔵 `todo-comment` — infos: Address the TODO or FIXME before merge.
🔵 `magic-number` — infos: Extract magic numbers into named constants.
🟡 `unreachable-code` — warnings: Code after return/throw/break is unreachable.
🔴 `no-empty-catch` — errors: Catch blocks must handle or rethrow the error.
🟡 `unhandled-promise` — warnings: Promises should be awaited or have .catch() / try-catch.
🟡 `throw-in-async` — warnings: Use Promise.reject() or throw inside an async function with await, not bare throw in promise chains.
🟡 `no-delete-object-prop` — warnings: Avoid delete on object properties; prefer setting to undefined or restructuring.
🔵 `prefer-optional-chain` — infos: Prefer optional chaining (?.) over manual null checks where safe.

## Performance budgets

7 budget finding(s):

🔵 **missing-side-effects**: "@babel/parser" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle
🔵 **missing-side-effects**: "@clack/prompts" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle
🔵 **missing-side-effects**: "@huggingface/transformers" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle
🔵 **missing-side-effects**: "cli-table" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle
🔵 **missing-side-effects**: "commander" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle
🔵 **missing-side-effects**: "pngjs" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle
🔵 **missing-side-effects**: "ws" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle

_No Metro bundle snapshot taken (no entry file or react-native not installed)_

✅ Code review passed. Proceeding to verification and PR.