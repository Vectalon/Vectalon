# Code review

# Code Review Report

**Summary:** 0 error(s), 2 warning(s), 5 info note(s)
**Files reviewed:** 9
**Heal policy:** 3 attempt(s), severity ≥ error, tool checks on, compile gate on
**Reviewer:** LLM + rule-based analyzer

## Findings by file

### src/services/CreateLoginScreenEmailPasswordApi.ts

**LLM review:** ✅ approved — Clean code (golden replay)

### src/hooks/useCreateLoginScreenEmailPassword.ts

**LLM review:** ✅ approved — Clean code (golden replay)

### src/screens/CreateLoginScreenEmailPasswordScreen.tsx

**LLM review:** ✅ approved — Clean code (golden replay)

**Rule-based findings:**
🟡 **unreachable-code** (line 9): Code after return/throw/break is unreachable.
🟡 **missing-accessibility** (line 15): Interactive elements should have accessibilityLabel and accessibilityRole.
🔵 **magic-number** (line 28): Extract magic numbers into named constants.
🔵 **magic-number** (line 29): Extract magic numbers into named constants.
🔵 **magic-number** (line 30): Extract magic numbers into named constants.

### /Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/login-app/src/__tests__/CreateLoginScreenEmailPassword.tsx

**LLM review:** ✅ approved — Clean code (golden replay)

### /Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/login-app/src/__tests__/useCreateLoginScreenEmailPassword.ts

**LLM review:** ✅ approved — Clean code (golden replay)

### /Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/login-app/src/__tests__/CreateLoginScreenEmailPasswordApi.ts

**LLM review:** ✅ approved — Clean code (golden replay)

### /Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/login-app/.maestro/CreateLoginScreenEmailPassword.yaml

**LLM review:** ✅ approved — Clean code (golden replay)


## Rules checked
❌ TypeScript strict mode: enabled — enforce strict typing
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
🟡 `use-pressable` — warnings: Prefer Pressable over TouchableOpacity — Pressable offers full press-state control and better accessibility defaults.
🟡 `no-leaked-render` — warnings: Avoid {value && <Component />} when value can be a falsy string or number — use {value ? <Component /> : null} to prevent a production crash (or coerce with !!value &&).
🟡 `inline-deps-object` — warnings: Avoid creating new objects/arrays inside useEffect/useCallback dependency arrays — causes unnecessary re-runs.
🟡 `animation-layout-props` — warnings: Animate only transform and opacity — width/height/top/left/margin/padding trigger layout recalculation on every frame.
🟡 `animation-press-gesture` — warnings: Animated press states should use GestureDetector with Gesture.Tap() (UI-thread worklets) instead of onPressIn/onPressOut (JS thread).
🟡 `navigation-native-stack` — warnings: Use the native navigators — @react-navigation/native-stack or native tabs — instead of the JS @react-navigation/stack or bottom-tabs.
🟡 `list-scrollview-map` — warnings: ScrollView renders every child at once — use a virtualizer (FlashList or LegendList) for mapped lists.
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

2 budget finding(s):

🔵 **missing-side-effects**: "expo" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle
🔵 **missing-side-effects**: "react-native-screens" does not declare `sideEffects: false` — tree-shaking may keep dead code in the bundle

_No Metro bundle snapshot taken (no entry file or react-native not installed)_

✅ Code review passed. Proceeding to verification and PR.