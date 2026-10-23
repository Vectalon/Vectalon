# Native baseline — 2026-10-22

**2026-10-22 verdict: patched iOS Simulator Release build passed; runtime failed.** The Expo 58 follow-up below verifies baseline runtime on 2026-10-23. Native model-task qualification and model improvement remain unproven. No model-generated candidate was applied.

## Identity and scope

- Vectalon source: `7b251bb40d7522908eee2eab35d2565aaf79d530`, `apps/website/demo/login-app` archived into `/private/tmp/vectalon-native-proof-xsLBRd`.
- Dependencies copied from the installed demo into the disposable directory, not freshly installed from a lockfile. Observed Expo 53.0.27, React 19.0.0, RN 0.79.0, screens 4.10.0, safe-area-context 5.4.0, expo-status-bar 57.0.1.
- Xcode 27.0 (27A266a), Apple clang 21.0.0, CocoaPods 1.17.0. Release, generic iOS Simulator destination, signing disabled, four build jobs.
- Expo prebuild generated the native project; scratch app config adds bundle ID `in.vectalon.nativeproof`. Pod install succeeded (75 pods).
- Installed on the already booted iPhone 18 Pro simulator, iOS 27.0, UDID `9C219A24-CCFD-49CD-AD19-965A0E974B04`. No physical device used.

## All attempts retained

| Attempt | Modification | Build | Runtime |
|---|---|---|---|
| 1 | Generated native project only | Failed, exit 65; five fmt 11.0.2 consteval errors | Not run |
| 2 | Scratch fmt compatibility patch below | Failed, exit 65; Metro could not resolve `/tmp/.../index.js` against `/private/tmp/...` | Not run |
| 3 | Same patch plus canonical PROJECT_ROOT and ENTRY_FILE | Passed, exit 0; xcresult reports zero errors, 27 warnings | Installed; launch request succeeded, but Welcome never appeared and process crashed |

Result bundles: `/private/tmp/vectalon-native-proof-xsLBRd/native-build-{1,2,3}.xcresult`. These are local temporary artifacts, not portable retained binaries. Attempt 2 reports 206 warnings; the incremental third build's smaller warning count is not a clean rebuild comparison.

Scratch `ios/Pods/fmt/include/fmt/base.h` patch:

```diff
-#elif defined(__apple_build_version__) && __apple_build_version__ < 14000029L
-#  define FMT_USE_CONSTEVAL 0  // consteval is broken in Apple clang < 14.
+#elif defined(__apple_build_version__)
+#  define FMT_USE_CONSTEVAL 0  // Diagnostic compatibility workaround; upstream fmt issue 4740.
```

Upstream diagnostic reference: https://github.com/fmtlib/fmt/issues/4740. This is not an approved production dependency repair. No repository dependency was patched.

Scratch `ios/.xcode.env.local` adds canonical `PROJECT_ROOT=/private/tmp/vectalon-native-proof-xsLBRd` and `ENTRY_FILE=/private/tmp/vectalon-native-proof-xsLBRd/index.js` to the generated Node binary setting. The third build bundled JS into the Release app; no interactive Metro server was started.

## Runtime observation

Argent installed and launched `in.vectalon.nativeproof`. The post-launch screenshot/tree showed the simulator home screen. An eight-second wait for the source-defined Welcome label returned `success: false`, `cause: unmet`. No onboarding, form validation or cart task was exercised.

Crash report: `/Users/bhishaksanyal/Library/Logs/DiagnosticReports/loginapp-2026-10-22-151926.ips`. Sanitized facts: `EXC_BREAKPOINT`, `SIGTRAP`, main-thread top frame `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`, followed by UIKit scene creation. The generated AppDelegate uses `@UIApplicationMain` and creates its window in application launch; its Info.plist contains no scene manifest. This points to a native lifecycle/toolchain compatibility blocker; no app-level JS failure or model-quality cause was established. Launch used Argent instrumentation; an uninstrumented control was not run.

Device-scoped Argent services were stopped after inspection. The disposable app/build and crash evidence remain available locally. Existing apps and customer data were not changed.

## Artifact checksums (SHA-256)

| Artifact | Hash |
|---|---|
| Generated Podfile.lock | `e130461775c2fa3897212dd3d25e3d5134b5ade22bf3a07d481ca74f1a3fdf38` |
| Patched fmt base.h | `bda8d7fea2f0ddf3e3ed8bcd137dbd7cf7324662e50b1223cab2fe3bd2f50404` |
| Scratch app.json | `50b7eb4a71906f9b328f50803400a9935a5356ab2b1c173782b75b0757b9eca7` |
| Release main.jsbundle | `d12845b9e27391513727ab6e1b1688bd1ed4717b1eb2c20463fe06c17a560169` |
| Release loginapp executable before instrumentation | `6642d0623a1c49289aba222937d27167f7e461d8d87613c2710a4d8534451d91` |

## Remaining gates

Choose and qualify a coherent Expo/RN/Xcode/runtime lane, including the generated scene lifecycle. Reconcile dependencies: this installed Expo package recommends RN 0.79.6, screens ~4.11.1 and expo-status-bar ~2.2.3; the observed versions differ. Do not silently upgrade the baseline between paired model conditions.

After baseline runtime succeeds, freeze fresh feature/fix/review tasks, compare the same model under comparable budgets, and verify accepted outputs natively. Existing cart comparisons remain zero task passes; this native build cannot improve those counts. Android, physical devices, clean dependency reproduction, unpatched build success, native UI acceptance, and reliable task improvement are not verified.

Existing reporting/runner regression checks rerun: 12 tests passed. Core/Admin, customer grants, production configuration and package releases unchanged.

## Expo 58 follow-up — 2026-10-23

**Verified: fresh dependency installation, unpatched generated Release build, and baseline UI on one iOS simulator.** Final app source: `7da3f6e52049980f53460d0ccfce35130e1763aa`; upgrade commit: `84cd1cb2bc5033e825fad0d797a88734c1e87e81`. Core/Admin unchanged. No package publication.

The demo now uses Expo 58.0.17, RN 0.88.0, React 19.3.0, screens 4.30.0, safe-area-context 5.10.1 and expo-status-bar 58.0.4. Expo 58 supplies the generated scene delegate and manifest required by this toolchain ([upstream notes](https://expo.dev/changelog/sdk-58)). Babel/Jest dependencies are explicit and aligned; test setup resolves Expo's lazy globals before Jest teardown. A device-observed secondary-button contrast defect was fixed in the shared demo component, including its loading indicator, with a rendered text/background contrast regression check.

Fresh build root: `/private/tmp/vectalon-expo58-native-Z5pg9t`. `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline` succeeded, installing 1,167 packages. Eighty tracked app files and dependency declarations matched the final source snapshot; only generated package scripts, replay prose and ignore rules were excluded from that file comparison. Expo prebuild updated scratch native launch scripts. The npm lockfile is tracked; generated native directories are ignored.

Reproduction from that root:

```sh
CI=1 EXPO_NO_TELEMETRY=1 node node_modules/expo/bin/cli prebuild --platform ios --no-install
cd ios
CI=1 EXPO_NO_TELEMETRY=1 pod install
CI=1 EXPO_NO_TELEMETRY=1 xcodebuild -workspace loginapp.xcworkspace -scheme loginapp -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/vectalon-expo58-native-Z5pg9t/derived -resultBundlePath /private/tmp/vectalon-expo58-native-Z5pg9t/native-build-1.xcresult -jobs 4 CODE_SIGNING_ALLOWED=NO build -quiet
```

Use a new result bundle path for another build. Node 24.21.0, Xcode 27.0, CocoaPods 1.17.0. The generated native dependency scripts were inspected before the build. No fmt, native source, generated project or canonical-path patch was applied. Pod installation uses prebuilt dependencies plus source modules; this is not a rebuild of all upstream frameworks from source.

One pod-install attempt was interrupted because the official RN dependency download slowed substantially. The same partial release artifact was resumed over HTTP/1.1, matched the publisher's SHA-256 `309b2fcea39fb4cdeb434144e735bc4065ac0dd8720e4f35ffee55fb3be54093`, and was moved to the expected artifact filename before retrying pod installation. The retry installed 100 pods. No alternate artifact or checksum bypass was used.

| Native build | Result | Errors | Warnings | Scope |
|---|---|---:|---:|---|
| `native-build-1.xcresult` | succeeded | 0 | 243 | Fresh Expo 58 baseline; 163.501 seconds recorded by Xcode |
| `native-build-2.xcresult` | succeeded | 0 | 30 | Incremental rebuild after shared button contrast fix; 12.621 seconds |

Warnings include upstream nullability/deprecation, Swift module context-recovery diagnostics and an Expo module visibility warning. Incremental warning counts are not a clean-build improvement metric. Xcode reported success and zero errors for both builds; runtime was then checked separately.

The final Release app was installed and launched with Argent on the same iPhone 18 Pro / iOS 27.0 simulator. Screenshots and accessibility trees confirmed:

| Check | Observed result |
|---|---|
| Launch / onboarding | Welcome rendered; Continue opened Sign in |
| Empty submission | Visible `Invalid email address`; stayed on Sign in |
| Demo login | Existing offline unit-test fixture opened Dashboard with zero cart items |
| Catalog / shared state | Catalog rendered; two Aurora Lamp additions changed View cart to 2 |
| Cart calculation | `2 × $49` and `Total: $98 (2 items)` rendered |
| Remove | Restored `Your cart is empty.` |
| Secondary buttons | Dark labels visible on the light background; contrast test passes |

The navigation/cart path passed on both the upgrade baseline and final contrast-fix build; button readability was verified after the repair. On the first run, default tool typing speed dropped characters; clearing and retyping at 200ms produced the full fixture value. The final pass used 200ms typing and completed. This is an automation timing observation, not proof of the root cause. Argent services for this device were stopped afterward. No interactive Metro server was started or stopped.

Retained final screenshots: [validation](native-expo58-2026-10-23-validation.png), [cart](native-expo58-2026-10-23-cart.png). Auth, catalog and cart services are offline demo implementations. This does not qualify production authentication or commercial checkout. No generated model output was applied, so no model task-success count changes.

| Final artifact | SHA-256 |
|---|---|
| npm package-lock.json | `1eb15e3cf08358bb15a388c156132d09a1b19cff534bbcf70b5ddefe80fc5b2e` |
| Generated Podfile.lock | `4b7e860e1275e7a36b63d8a986fb9acc9f2dfb6e3608fa9ae070093880e8fcad` |
| Release executable before instrumentation | `21c3ad1b9bce2d0d88c5c278c5c1f4505ee77644c9255a286e9543a5e15ef8cd` |
| Final bundled JavaScript | `4f5d22666e948199e718a9eb2e1588cbf958526714a452b27009bb28f20f7d2e` |

Verification: final demo TypeScript and 34 tests across 14 suites passed; the fresh install passed the original 33 tests and TypeScript before the contrast repair. Twelve experiment/report tests and capability checks passed. Expo dependency validation passed against its installed dependency map; its network endpoint was unavailable, so this was the offline check. Existing SafeAreaView deprecation warnings remain.

Final experiment preflight at `/private/tmp/vectalon-cart-pilot-PdpwVz/report.json` records source `7da3f6e`: assistant-written positive control passes typecheck/tests; unchanged negative control fails both; all six inference slots remain not run. An initial sandbox invocation failed with process-permission exit 71 and is retained at `/private/tmp/vectalon-cart-pilot-lTDjXb`; permitted controls subsequently passed. No model inference or improvement result was produced.

Next: freeze fresh feature/fix/review tasks and compare the same model under comparable budgets, then run applicable native checks on accepted generated outputs. Android, physical devices, external developer acceptance, signed distribution and reliable model-task improvement remain open. Temporary result bundles are local evidence and are not committed binaries.
