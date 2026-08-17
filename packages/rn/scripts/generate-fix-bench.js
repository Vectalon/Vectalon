/**
 * Generate the vc fix-benchmark pack — 100 real React Native failure scenarios
 * across the ten families the roadmap directive #2 names (Gradle conflicts,
 * Kotlin, AGP, CocoaPods, Xcode, Metro, Hermes, RN upgrade breakages, native
 * module linking, TypeScript regressions).
 *
 * Each scenario JSON is self-contained: `broken` files overlay the shared
 * healthy base (src/fixBench/base.ts) to inject the failure, `healthy` is the
 * fixed state used as the false-positive control, and `expect` carries the
 * diagnosis + fix the pipeline must produce.
 *
 * Run: node scripts/generate-fix-bench.js   (writes bench/fix/*.json)
 */
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const OUT = join(__dirname, '..', 'bench', 'fix')

// ---------------------------------------------------------------------------
// Shared log fragments (real-shaped Gradle / Xcode / Metro / tsc output)
// ---------------------------------------------------------------------------

const gradlePreamble = `> Task :app:processDebugResources FAILED

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:processDebugResources'.
`

const gradleDepPreamble = `> Task :app:preDebugBuild FAILED

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:preDebugBuild'.
`

const xcodePreamble = `▸ Compiling ViewController.swift

❌  /Users/dev/ios/App/ViewController.swift:42:5: error:
`

const metroPreamble = `error: Error: Unable to resolve module

 Metro has failed to resolve the module.
`

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

const S = []

// ===========================================================================
// SUITE 1 — gradle-conflict (10)
// ===========================================================================

S.push({
  id: 'fx-gradle-01',
  suite: 'gradle-conflict',
  title: 'Duplicate GMS class after adding maps + analytics',
  issue: 'Android build started failing with a duplicate class error after adding react-native-maps and analytics — com.google.android.gms.common.api.GoogleApiClient is defined twice.',
  log: `${gradlePreamble}
Duplicate class com.google.android.gms.common.api.GoogleApiClient found in modules play-services-basement-17.6.0 (com.google.android.gms:play-services-basement:17.6.0) and play-services-base-18.0.0 (com.google.android.gms:play-services-base:18.0.0)
  The class is referenced from play-services-maps-18.0.2 (com.google.android.gms:play-services-maps:18.0.2)
`,
  broken: {
    'android/app/build.gradle': `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
}

android {
    namespace "com.rnbenchapp"
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.google.android.gms:play-services-maps:18.0.2")
    implementation("com.google.android.gms:play-services-analytics:17.0.0")
    implementation("com.google.android.gms:play-services-basement:17.6.0")
}
`,
  },
  healthy: {
    'android/app/build.gradle': `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
}

android {
    namespace "com.rnbenchapp"
}

configurations.all {
    resolutionStrategy {
        force "com.google.android.gms:play-services-basement:18.0.0"
        force "com.google.android.gms:play-services-base:18.0.0"
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.google.android.gms:play-services-maps:18.0.2")
    implementation("com.google.android.gms:play-services-analytics:17.0.0")
}
`,
  },
  expect: {
    diagnosisId: 'duplicate-class',
    diagnosisKeywords: ['Duplicate class'],
    fixFile: 'android/app/build.gradle',
    mustContain: ['resolutionStrategy'],
    mustNotContain: ['play-services-basement:17.6.0")\n    implementation("com.google.android.gms:play-services-analytics'],
    autoFixable: false,
  },
})

S.push({
  id: 'fx-gradle-02',
  suite: 'gradle-conflict',
  title: 'react-android resolution failure after RN version bump',
  issue: 'After bumping react-native to 0.74.1, the Android build cannot resolve react-android.',
  log: `${gradleDepPreamble}
* What went wrong:
Could not resolve com.facebook.react:react-android:0.74.1.
  Could not find com.facebook.react:react-android:0.74.1.
       Searched in the following locations:
         - https://repo.maven.apache.org/maven2/com/facebook/react/react-android/0.74.1/react-android-0.74.1.pom
`,
  broken: {
    'package.json': `{
  "name": "rn-bench-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "react-native start",
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.74.1"
  },
  "devDependencies": {
    "@babel/core": "7.24.9",
    "@babel/preset-env": "7.24.8",
    "@babel/preset-typescript": "7.24.7",
    "@types/jest": "29.5.14",
    "@types/react": "18.2.79",
    "@typescript-eslint/eslint-plugin": "6.21.0",
    "@typescript-eslint/parser": "6.21.0",
    "babel-jest": "29.7.0",
    "eslint": "8.57.0",
    "jest": "29.7.0",
    "react-test-renderer": "18.2.0",
    "typescript": "5.5.4"
  },
  "jest": {
    "preset": "react-native"
  }
}
`,
  },
  healthy: {
    'package.json': `{
  "name": "rn-bench-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "react-native start",
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.74.0"
  },
  "devDependencies": {
    "@babel/core": "7.24.9",
    "@babel/preset-env": "7.24.8",
    "@babel/preset-typescript": "7.24.7",
    "@types/jest": "29.5.14",
    "@types/react": "18.2.79",
    "@typescript-eslint/eslint-plugin": "6.21.0",
    "@typescript-eslint/parser": "6.21.0",
    "babel-jest": "29.7.0",
    "eslint": "8.57.0",
    "jest": "29.7.0",
    "react-test-renderer": "18.2.0",
    "typescript": "5.5.4"
  },
  "jest": {
    "preset": "react-native"
  }
}
`,
  },
  expect: {
    diagnosisId: 'dependency-resolution',
    diagnosisKeywords: ['Could not resolve', 'Could not find'],
    fixFile: 'package.json',
    mustContain: ['"react-native": "0.74.0"'],
    mustNotContain: ['"react-native": "0.74.1"'],
    autoFixable: false,
  },
})

S.push({
  id: 'fx-gradle-03',
  suite: 'gradle-conflict',
  title: 'AAPT2 resource linking failure from a vector asset',
  issue: 'Android build fails at resource linking with an AAPT2 error on a drawable.',
  log: `${gradlePreamble}
> AAPT2 aapt2-8.4.1-10909125-linux Daemon #0: Daemon startup failed
  This should not happen under normal circumstances, please report an issue if this occurs.
error: failed to link file resources.
  /src/android/app/src/main/res/drawable/ic_launcher_foreground.xml:2: AAPT2 error: check logs for details
`,
  broken: {
    'android/app/src/main/res/drawable/ic_launcher_foreground.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
  <path android:fillColor="#FFFFFF"
      android:pathData="M54,54m-50,0a50,50 0,1 1,100 0a50,50 0,1 1,-100 0" />
</vector>
`,
  },
  healthy: {
    'android/app/src/main/res/drawable/ic_launcher_foreground.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
  <path android:fillColor="#FFFFFF"
      android:pathData="M54,54m-50,0a50,50 0,1 1,100 0a50,50 0,1 1,-100 0"
      android:fillType="evenOdd" />
</vector>
`,
  },
  expect: {
    diagnosisId: 'resource-link',
    diagnosisKeywords: ['AAPT2', 'resource linking'],
    fixFile: 'android/app/src/main/res/drawable/ic_launcher_foreground.xml',
    mustContain: ['fillType'],
    mustNotContain: [],
    autoFixable: false,
  },
})

S.push({
  id: 'fx-gradle-04',
  suite: 'gradle-conflict',
  title: 'minSdkVersion 21 clashes with a native module requiring 23',
  issue: 'Android build fails: the manifest merger says minSdkVersion 21 cannot be smaller than version 23.',
  log: `${gradlePreamble}
uses-sdk:minSdkVersion 21 cannot be smaller than version 23 declared in library [react-native-webview:13.8.6] /src/android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml as the library might be using APIs not available in 21
  Suggestion: use a compatible library with a minSdk of at most 21, or increase this project's minSdkVersion to at least 23
`,
  broken: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 21
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  healthy: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  expect: {
    diagnosisId: 'min-sdk-version',
    diagnosisKeywords: ['minSdkVersion'],
    fixFile: 'android/build.gradle',
    mustContain: ['minSdkVersion = 23'],
    mustNotContain: ['minSdkVersion = 21'],
    autoFixable: true,
  },
})

S.push({
  id: 'fx-gradle-05',
  suite: 'gradle-conflict',
  title: 'Duplicate resource between two libraries',
  issue: 'Android build fails: a duplicate resource is found across two native libraries.',
  log: `${gradlePreamble}
AAPT2 error: check logs for details
error: duplicate resource: drawable/common_google_signin_btn_icon_disabled, in library com.google.android.gms:play-services-base:18.0.0 and com.google.android.gms:play-services-auth:20.4.0
`,
  broken: {
    'android/app/build.gradle': `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
}

android {
    namespace "com.rnbenchapp"
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.google.android.gms:play-services-base:18.0.0")
    implementation("com.google.android.gms:play-services-auth:20.4.0")
}
`,
  },
  healthy: {
    'android/app/build.gradle': `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
}

android {
    namespace "com.rnbenchapp"
    packagingOptions {
        resources {
            excludes += ["**/common_google_signin_btn_icon_disabled.xml"]
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.google.android.gms:play-services-auth:20.4.0")
}
`,
  },
  expect: {
    diagnosisId: 'resource-link',
    diagnosisKeywords: ['duplicate resource'],
    fixFile: 'android/app/build.gradle',
    mustContain: ['packagingOptions'],
    mustNotContain: ['play-services-base:18.0.0'],
    autoFixable: false,
  },
})

S.push({
  id: 'fx-gradle-06',
  suite: 'gradle-conflict',
  title: 'NDK source.properties missing for the pinned NDK',
  issue: 'Android build fails: the NDK version pinned does not have a source.properties file.',
  log: `${gradleDepPreamble}
* What went wrong:
Execution failed for task ':app:mergeDebugNativeLibs'.
> A problem occurred configuring project ':app'.
> NDK at /Users/dev/Library/Android/sdk/ndk/25.1.8937393 did not have a source.properties file
`,
  broken: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "25.1.8937393"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  healthy: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  expect: {
    diagnosisId: 'ndk-version',
    diagnosisKeywords: ['NDK'],
    fixFile: 'android/build.gradle',
    mustContain: ['ndkVersion = "26.1.10909125"'],
    mustNotContain: ['ndkVersion = "25.1.8937393"'],
    autoFixable: false,
  },
})

S.push({
  id: 'fx-gradle-07',
  suite: 'gradle-conflict',
  title: 'Unsupported class file major version 62 (Java 18)',
  issue: 'Android build fails with "Unsupported class file major version 62" — Java version mismatch.',
  log: `${gradleDepPreamble}
* What went wrong:
Execution failed for task ':app:compileDebugKotlin'.
> Unsupported class file major version 62
`,
  broken: {
    'android/gradle.properties': `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g
android.useAndroidX=true
android.enableJetifier=true
`,
  },
  healthy: {
    'android/gradle.properties': `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g
android.useAndroidX=true
android.enableJetifier=true
`,
  },
  expect: {
    diagnosisId: 'java-version',
    diagnosisKeywords: ['Unsupported class file major version'],
    fixFile: 'android/gradle.properties',
    mustContain: ['org.gradle.jvmargs'],
    mustNotContain: [],
    autoFixable: false,
  },
})

S.push({
  id: 'fx-gradle-08',
  suite: 'gradle-conflict',
  title: 'Network failure fetching a maven artifact',
  issue: 'Android build fails to download an artifact — connection refused to mavenCentral.',
  log: `${gradleDepPreamble}
* What went wrong:
Could not GET 'https://repo.maven.apache.org/maven2/com/facebook/react/react-android/0.74.0/react-android-0.74.0.pom'.
> Connection refused (Connection refused)
`,
  broken: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  healthy: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  expect: {
    diagnosisId: 'network',
    diagnosisKeywords: ['Could not GET', 'Connection refused'],
    fixFile: 'android/build.gradle',
    mustContain: ['mavenCentral()'],
    mustNotContain: [],
    autoFixable: false,
  },
})

S.push({
  id: 'fx-gradle-09',
  suite: 'gradle-conflict',
  title: 'Gradle daemon out of memory on a large build',
  issue: 'Android build fails with OutOfMemoryError — the Gradle daemon heap is too small.',
  log: `${gradleDepPreamble}
* What went wrong:
Execution failed for task ':app:mergeReleaseResources'.
> org.gradle.api.GradleException: Java heap space
  There is insufficient memory for the Java Runtime Environment to continue.
  Native memory allocation (mmap) failed to map 1048576 bytes for committing reserved memory.
OutOfMemoryError: GC overhead limit exceeded
`,
  broken: {
    'android/gradle.properties': `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
android.useAndroidX=true
android.enableJetifier=true
`,
  },
  healthy: {
    'android/gradle.properties': `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g
android.useAndroidX=true
android.enableJetifier=true
`,
  },
  expect: {
    diagnosisId: 'memory',
    diagnosisKeywords: ['OutOfMemoryError', 'GC overhead'],
    fixFile: 'android/gradle.properties',
    mustContain: ['-Xmx4g'],
    mustNotContain: ['-Xmx2048m'],
    autoFixable: true,
  },
})

S.push({
  id: 'fx-gradle-10',
  suite: 'gradle-conflict',
  title: 'compileSdkVersion below the SDK the RN template requires',
  issue: 'Android build fails — the log asks to use SDK version 34 or higher.',
  log: `${gradleDepPreamble}
* What went wrong:
Execution failed for task ':app:checkDebugAarMetadata'.
> A problem occurred configuring project ':app'.
> Please use SDK version 34 or higher.
`,
  broken: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 33
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  healthy: {
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
  },
  expect: {
    diagnosisId: 'compile-sdk-version',
    diagnosisKeywords: ['SDK version', 'compileSdkVersion'],
    fixFile: 'android/build.gradle',
    mustContain: ['compileSdkVersion = 34'],
    mustNotContain: ['compileSdkVersion = 33'],
    autoFixable: true,
  },
})

// ===========================================================================
// SUITE 2 — kotlin (10)
// ===========================================================================

const kotlinVariants = [
  { id: 'fx-kotlin-01', title: 'Kotlin below the RN template pin (1.7.22 vs 1.9.0)', issue: 'Android build fails after a native dependency requires a newer Kotlin.', cur: '1.7.22', fix: '1.9.0', sdk: 34, rn: '0.74.0' },
  { id: 'fx-kotlin-02', title: 'Kotlin 1.8.22 with an RN 0.76 project needing 1.9.24', issue: 'Upgraded to RN 0.76 — Kotlin plugin version is too old.', cur: '1.8.22', fix: '1.9.24', sdk: 35, rn: '0.76.0' },
  { id: 'fx-kotlin-03', title: 'Kotlin 1.6.21 with RN 0.73', issue: 'Android build: Kotlin version 1.6.21 is not supported by the Kotlin Gradle plugin.', cur: '1.6.21', fix: '1.9.0', sdk: 34, rn: '0.73.0' },
  { id: 'fx-kotlin-04', title: 'Kotlin 1.6.21 with an RN 0.71 project', issue: 'Kotlin 1.6.21 fails to compile a native module shipped with RN 0.71.', cur: '1.6.21', fix: '1.7.22', sdk: 33, rn: '0.71.0' },
  { id: 'fx-kotlin-05', title: 'Kotlin 1.9.0 with an RN 0.76 project needing 1.9.24', issue: 'After upgrading RN, Kotlin compilation fails — the plugin is below the required version.', cur: '1.9.0', fix: '1.9.24', sdk: 35, rn: '0.76.0' },
  { id: 'fx-kotlin-06', title: 'Kotlin 1.7.22 with an RN 0.74 project needing 1.9.0', issue: 'New native module requires Kotlin 1.9+; project pins 1.7.22.', cur: '1.7.22', fix: '1.9.0', sdk: 34, rn: '0.74.0' },
  { id: 'fx-kotlin-07', title: 'Kotlin 1.8.22 with an RN 0.74 project needing 1.9.0', issue: 'Kotlin compiler error: this library requires Kotlin 1.9.0 or higher.', cur: '1.8.22', fix: '1.9.0', sdk: 34, rn: '0.74.0' },
  { id: 'fx-kotlin-08', title: 'Kotlin 1.9.10 with an RN 0.79 project needing 1.9.24', issue: 'RN 0.79 template pins Kotlin 1.9.24; project has 1.9.10.', cur: '1.9.10', fix: '1.9.24', sdk: 35, rn: '0.79.0' },
  { id: 'fx-kotlin-09', title: 'Kotlin 1.7.22 with an RN 0.76 project needing 1.9.24', issue: 'Android build: Kotlin Gradle plugin 1.7.22 is too old for this React Native version.', cur: '1.7.22', fix: '1.9.24', sdk: 35, rn: '0.76.0' },
  { id: 'fx-kotlin-10', title: 'Kotlin 1.8.0 with an RN 0.76 project needing 1.9.24', issue: 'Build fails: requires Kotlin 1.9.24, project has 1.8.0.', cur: '1.8.0', fix: '1.9.24', sdk: 35, rn: '0.76.0' },
]

for (const v of kotlinVariants) {
  S.push({
    id: v.id,
    suite: 'kotlin',
    title: v.title,
    issue: v.issue,
    log: `${gradleDepPreamble}
* What went wrong:
Execution failed for task ':app:compileDebugKotlin'.
> Could not compile Kotlin: the configured Kotlin plugin version ${v.cur} requires Kotlin >= ${v.fix}.
`,
    broken: kotlinBuildGradle(v.cur, v.sdk, v.rn),
    healthy: kotlinBuildGradle(v.fix, v.sdk, v.rn),
    expect: {
      diagnosisId: 'kotlin-version',
      diagnosisKeywords: ['Kotlin'],
      fixFile: 'android/build.gradle',
      mustContain: [`kotlinVersion = "${v.fix}"`],
      mustNotContain: [`kotlinVersion = "${v.cur}"`],
      autoFixable: true,
    },
  })
}

function kotlinBuildGradle(kotlin, sdk, rn) {
  const agp = rn >= '0.76' ? '8.6.0' : rn >= '0.74' ? '8.4.1' : rn === '0.73' ? '8.4.1' : '7.3.1'
  const gradle = rn >= '0.76' ? '8.10.2' : rn === '0.74' ? '8.8' : rn === '0.73' ? '8.8' : '7.5.1'
  const pkg = kotlinPkg(rn)
  return {
    'package.json': pkg,
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = ${sdk}
        targetSdkVersion = ${sdk}
        ndkVersion = "26.1.10909125"
        kotlinVersion = "${kotlin}"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:${agp}")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${kotlin}")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
    'android/gradle/wrapper/gradle-wrapper.properties': `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradle}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`,
  }
}

function kotlinPkg(rn) {
  return JSON.stringify({
    name: 'rn-bench-app',
    version: '1.0.0',
    private: true,
    scripts: { start: 'react-native start', android: 'react-native run-android', ios: 'react-native run-ios', test: 'jest', typecheck: 'tsc --noEmit', lint: 'eslint .' },
    dependencies: { react: '18.2.0', 'react-native': rn },
    devDependencies: {
      '@babel/core': '7.24.9', '@babel/preset-env': '7.24.8', '@babel/preset-typescript': '7.24.7',
      '@types/jest': '29.5.14', '@types/react': '18.2.79', '@typescript-eslint/eslint-plugin': '6.21.0',
      '@typescript-eslint/parser': '6.21.0', 'babel-jest': '29.7.0', eslint: '8.57.0', jest: '29.7.0',
      'react-test-renderer': '18.2.0', typescript: '5.5.4',
    },
    jest: { preset: 'react-native' },
  }, null, 2)
}

// ===========================================================================
// SUITE 3 — agp (10)
// ===========================================================================

// AGP fixture: RN → required Kotlin/Gradle/AGP, so only the broken axis is off.
function agpVersionFor(rn) {
  if (rn.startsWith('0.79') || rn.startsWith('0.78')) return '8.7.2'
  if (rn.startsWith('0.76') || rn.startsWith('0.75')) return '8.6.0'
  if (rn.startsWith('0.74') || rn.startsWith('0.73')) return '8.4.1'
  return '7.3.1'
}
function gradleVersionFor(rn) {
  if (rn.startsWith('0.79') || rn.startsWith('0.78') || rn.startsWith('0.76')) return '8.10.2'
  if (rn.startsWith('0.74') || rn.startsWith('0.73')) return '8.8'
  return '7.5.1'
}
function kotlinVersionFor(rn) {
  if (rn.startsWith('0.79') || rn.startsWith('0.78') || rn.startsWith('0.76')) return '1.9.24'
  if (rn.startsWith('0.74') || rn.startsWith('0.73')) return '1.9.0'
  return '1.7.22'
}

const agpVariants = [
  { id: 'fx-agp-01', title: 'AGP 7.3.1 with an RN 0.74 project (needs 8.4.1)', issue: 'Android build fails: the Android Gradle plugin version is too old for this RN.', cur: '7.3.1', fix: '8.4.1', rn: '0.74.0', sdk: 34, kind: 'agp' },
  { id: 'fx-agp-02', title: 'AGP 8.1.0 with an RN 0.76 project (needs 8.6.0)', issue: 'After upgrading RN, AGP is below the template pin.', cur: '8.1.0', fix: '8.6.0', rn: '0.76.0', sdk: 35, kind: 'agp' },
  { id: 'fx-agp-03', title: 'AGP 8.0.2 with an RN 0.74 project', issue: 'Gradle sync fails: AGP version is not compatible with this RN release.', cur: '8.0.2', fix: '8.4.1', rn: '0.74.0', sdk: 34, kind: 'agp' },
  { id: 'fx-agp-04', title: 'AGP 7.4.2 with an RN 0.73 project (needs 8.4.1)', issue: 'Android build fails — AGP 7.4.2 does not support the React Native Gradle plugin.', cur: '7.4.2', fix: '8.4.1', rn: '0.73.0', sdk: 34, kind: 'agp' },
  { id: 'fx-agp-05', title: 'AGP 8.4.1 with an RN 0.79 project (needs 8.7.2)', issue: 'RN 0.79 requires AGP 8.7.2+; build fails at configuration.', cur: '8.4.1', fix: '8.7.2', rn: '0.79.0', sdk: 35, kind: 'agp' },
  { id: 'fx-agp-06', title: 'AGP requires a newer Gradle (log-driven)', issue: 'Android build: "Minimum supported Gradle version is 8.8" after upgrading AGP.', cur: '8.1.0', fix: '8.4.1', rn: '0.74.0', sdk: 34, kind: 'agp', log: 'Minimum supported Gradle version is 8.8. Current version is 8.0. Please fix the project\'s Gradle settings.' },
  { id: 'fx-agp-07', title: 'AGP + Kotlin plugin version mismatch', issue: 'Android build fails: the Android Gradle plugin does not support the pinned Kotlin plugin.', cur: '8.1.0', fix: '8.4.1', rn: '0.74.0', sdk: 34, kind: 'agp' },
  { id: 'fx-agp-08', title: 'Gradle wrapper 8.0 with an RN 0.74 project (needs 8.8)', issue: 'Android build fails: the Gradle wrapper is below the version AGP/RN require.', cur: '8.0', fix: '8.8', rn: '0.74.0', sdk: 34, kind: 'wrapper' },
  { id: 'fx-agp-09', title: 'Gradle wrapper 7.6.4 with an RN 0.73 project (needs 8.8)', issue: 'Android build: Gradle 7.6.4 is not supported by this React Native version.', cur: '7.6.4', fix: '8.8', rn: '0.73.0', sdk: 34, kind: 'wrapper' },
  { id: 'fx-agp-10', title: 'AGP 7.2.1 with an RN 0.71 project (needs 7.3.1)', issue: 'Android build fails with a Gradle/AGP incompatibility after touching the wrapper.', cur: '7.2.1', fix: '7.3.1', rn: '0.71.0', sdk: 33, kind: 'agp' },
]

for (const v of agpVariants) {
  const isWrapper = v.kind === 'wrapper'
  const broken = agpBuildGradle(isWrapper ? agpVersionFor(v.rn) : v.cur, isWrapper ? v.cur : gradleVersionFor(v.rn), v.rn, v.sdk)
  const healthy = agpBuildGradle(isWrapper ? agpVersionFor(v.rn) : v.fix, isWrapper ? v.fix : gradleVersionFor(v.rn), v.rn, v.sdk)
  S.push({
    id: v.id,
    suite: 'agp',
    title: v.title,
    issue: v.issue,
    log: v.log ? `${gradleDepPreamble}\n* What went wrong:\n${v.log}\n` : undefined,
    broken,
    healthy,
    expect: {
      diagnosisId: isWrapper ? 'gradle-wrapper-version' : 'agp-version',
      diagnosisKeywords: v.log ? ['Minimum supported Gradle'] : isWrapper ? ['Gradle wrapper'] : ['Android Gradle Plugin'],
      fixFile: isWrapper ? 'android/gradle/wrapper/gradle-wrapper.properties' : 'android/build.gradle',
      mustContain: isWrapper ? [`gradle-${v.fix}-bin.zip`] : [`gradle:${v.fix}`],
      mustNotContain: isWrapper ? [`gradle-${v.cur}-bin.zip`] : [`gradle:${v.cur}`],
      autoFixable: true,
    },
  })
}

function agpBuildGradle(agp, gradle, rn, sdk) {
  const kotlin = kotlinVersionFor(rn)
  return {
    'package.json': kotlinPkg(rn),
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = ${sdk}
        targetSdkVersion = ${sdk}
        ndkVersion = "26.1.10909125"
        kotlinVersion = "${kotlin}"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:${agp}")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${kotlin}")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
    'android/gradle/wrapper/gradle-wrapper.properties': `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradle}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`,
  }
}

// ===========================================================================
// SUITE 4 — cocoapods (10)
// ===========================================================================

const pods = [
  { id: 'fx-pod-01', pod: 'RNVectorIcons', pkg: 'react-native-vector-icons', title: 'Pod RNVectorIcons not found after adding the package', issue: 'pod install fails: unable to find a specification for RNVectorIcons.' },
  { id: 'fx-pod-02', pod: 'RNCAsyncStorage', pkg: '@react-native-async-storage/async-storage', title: 'AsyncStorage pod missing from the local spec repo', issue: 'iOS build fails at pod install — RNCAsyncStorage spec not found.' },
  { id: 'fx-pod-03', pod: 'RNPermissions', pkg: 'react-native-permissions', title: 'Permissions pod version unpublished', issue: 'pod install fails: RNPermissions pod could not be found on trunk.' },
  { id: 'fx-pod-04', pod: 'RNGoogleSignin', pkg: '@react-native-google-signin/google-signin', title: 'Google Sign-In pod missing (CDN sync)', issue: 'pod install fails: CDN trunk URL could not be downloaded for RNGoogleSignin.' },
  { id: 'fx-pod-05', pod: 'RNGestureHandler', pkg: 'react-native-gesture-handler', title: 'Swift pod not found — pod install not run after adding a package', issue: 'iOS build fails: the Swift pod RNGestureHandler could not be found — did you run pod install?' },
  { id: 'fx-pod-06', pod: 'RNScreens', pkg: 'react-native-screens', title: 'Podfile.lock changed — pod install required', issue: 'iOS build fails: the Podfile.lock has changed, run pod install.' },
  { id: 'fx-pod-07', pod: 'RNReanimated', pkg: 'react-native-reanimated', title: 'Reanimated pod version out of sync with npm', issue: 'pod install fails: reanimated pod version does not match the npm version.' },
  { id: 'fx-pod-08', pod: 'RNBlur', pkg: '@react-native-community/blur', title: 'Blur pod published under a different name', issue: 'pod install fails: unable to find a specification for RNBlur.' },
  { id: 'fx-pod-09', pod: 'RNDeviceInfo', pkg: 'react-native-device-info', title: 'DeviceInfo pod conflicts with a local pod', issue: 'pod install fails: RNDeviceInfo pod conflicts with an existing pod of the same name.' },
  { id: 'fx-pod-10', pod: 'RNFastImage', pkg: 'react-native-fast-image', title: 'FastImage pod needs a different subspec', issue: 'pod install fails: the RNFastImage podspec requires a platform not configured.' },
]

for (const v of pods) {
  const isNotFound = ['fx-pod-01', 'fx-pod-02', 'fx-pod-03', 'fx-pod-04', 'fx-pod-07', 'fx-pod-08', 'fx-pod-09'].includes(v.id)
  const podErr = isNotFound
    ? `Unable to find a specification for "${v.pod}"` + (v.id === 'fx-pod-04' ? `\n[!] CDN: trunk URL couldn't be downloaded: https://cdn.cocoapods.org/all_pods_versions_${v.pod.toLowerCase()}_0_1.txt` : '')
    : `[!] The Swift pod \`${v.pod}\` could not be found in project ios/Podfile`
  S.push({
    id: v.id,
    suite: 'cocoapods',
    title: v.title,
    issue: v.issue,
    log: `Analyzing dependencies
[!] CocoaPods could not find compatible versions for pod "${v.pod}":
  In Podfile:
    ${v.pod} (from \`../node_modules/${v.pkg}\`)

${podErr}
`,
    broken: {
      'package.json': podPkg(v.pkg),
      'ios/Podfile': `require_relative '../node_modules/react-native/scripts/react_native_pods'
require_relative '../node_modules/@react-native-community/cli-platform-ios/native_modules'

platform :ios, '13.4'

target 'rn-bench-app' do
  config = use_native_modules!
  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true
  )
end
`,
    },
    healthy: {
      'package.json': podPkg(v.pkg),
      'ios/Podfile': `require_relative '../node_modules/react-native/scripts/react_native_pods'
require_relative '../node_modules/@react-native-community/cli-platform-ios/native_modules'

platform :ios, '13.4'

target 'rn-bench-app' do
  config = use_native_modules!
  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true
  )
  pod '${v.pod}', :path => '../node_modules/${v.pkg}'
end
`,
    },
    expect: {
      diagnosisId: isNotFound ? 'pod-not-found' : 'pod-install-needed',
      diagnosisKeywords: ['pod', 'CocoaPods'],
      fixFile: 'ios/Podfile',
      mustContain: [`pod '${v.pod}'`],
      mustNotContain: [],
      autoFixable: false,
    },
  })
}

function podPkg(pkg) {
  const p = JSON.parse(kotlinPkg('0.74.0'))
  p.dependencies[pkg] = '^1.0.0'
  return JSON.stringify(p, null, 2)
}

// ===========================================================================
// SUITE 5 — xcode (10)
// ===========================================================================

const xcodeScenarios = [
  { id: 'fx-xcode-01', title: 'Code signing: no signing certificate for the bundle id', issue: 'iOS build fails: Signing for "rn-bench-app" requires a development team.', log: `Signing for "rn-bench-app" requires a development team.
Select a development team in the Signing & Capabilities editor.`, id_rc: 'code-signing' },
  { id: 'fx-xcode-02', title: 'errSecInternalComponent during codesign', issue: 'iOS build fails at the CodeSign step with errSecInternalComponent.', log: `CodeSign error: errSecInternalComponent`, id_rc: 'code-signing' },
  { id: 'fx-xcode-03', title: 'Provisioning profile does not include the device', issue: 'iOS build fails: provisioning profile does not include the currently selected device.', log: `Provisioning profile "iOS Team Provisioning Profile: *" doesn't include the currently selected device.`, id_rc: 'provisioning' },
  { id: 'fx-xcode-04', title: 'No provisioning profiles found for the bundle id', issue: 'iOS build fails: no profiles for org.rnbench.app were found.', log: `No profiles for 'org.rnbench.app' were found: Xcode couldn't find any iOS App Development provisioning profiles matching 'org.rnbench.app'.`, id_rc: 'provisioning' },
  { id: 'fx-xcode-05', title: 'Linker: undefined symbols from a native library', issue: 'iOS build fails at the link step with undefined symbols after adding a native module.', log: `Undefined symbols for architecture arm64:
  "_OBJC_CLASS_$_RCTWebView", referenced from:
      objc-class-ref in AppDelegate.o
ld: symbol(s) not found for architecture arm64`, id_rc: 'linker' },
  { id: 'fx-xcode-06', title: 'Duplicate symbol after double import', issue: 'iOS build fails: duplicate symbol for the same class across two frameworks.', log: `duplicate symbol '_OBJC_CLASS_$_RNGestureHandler' in:
    /.../libRNGestureHandler.a
    /.../libRNGestureHandler.a`, id_rc: 'linker' },
  { id: 'fx-xcode-07', title: 'Framework not found', issue: 'iOS build fails: framework not found for a pod.', log: `ld: framework not found DoubleConversion`, id_rc: 'linker' },
  { id: 'fx-xcode-08', title: 'Deployment target below the supported range', issue: 'iOS build fails: deployment target is below the supported range.', log: `The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 12.0, but the range of supported deployment target versions is 13.4 to 17.0.99.`, id_rc: 'deployment-target' },
  { id: 'fx-xcode-09', title: 'Xcode version too old for the RN release', issue: 'iOS build fails: the project requires a newer version of Xcode.', log: `The project 'rn-bench-app' requires a newer version of Xcode.`, id_rc: 'xcode-version' },
  { id: 'fx-xcode-10', title: 'Invalid plist from a merge conflict', issue: 'iOS build fails: the Info.plist cannot be read.', log: `The Info.plist file is malformed: Data couldn't be read because it isn't in the correct format.`, id_rc: 'plist' },
]

for (const v of xcodeScenarios) {
  const isDeploymentTarget = v.id_rc === 'deployment-target'
  S.push({
    id: v.id,
    suite: 'xcode',
    title: v.title,
    issue: v.issue,
    log: `${xcodePreamble}\n${v.log}\n`,
    broken: isDeploymentTarget ? { 'ios/Podfile': podfileWithPlatform('12.0') } : {},
    healthy: isDeploymentTarget ? { 'ios/Podfile': podfileWithPlatform('13.4') } : {},
    expect: {
      diagnosisId: v.id_rc,
      diagnosisKeywords: [],
      fixFile: 'ios/Podfile',
      mustContain: isDeploymentTarget ? [`platform :ios, '13.4'`] : [],
      mustNotContain: isDeploymentTarget ? [`platform :ios, '12.0'`] : [],
      autoFixable: isDeploymentTarget,
    },
  })
}

function podfileWithPlatform(version) {
  return `require_relative '../node_modules/react-native/scripts/react_native_pods'
require_relative '../node_modules/@react-native-community/cli-platform-ios/native_modules'

platform :ios, '${version}'

target 'rn-bench-app' do
  config = use_native_modules!
  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true
  )
end
`
}

const brokenApp = `import React from 'react';
import { SafeAreaView, Text } from 'react-native';

function App(): React.JSX.Element {
  return (
    <SafeAreaView>
      <Text>rn-bench-app</Text>
    </SafeAreaView>
  );
}

export default App;
`
const fixedApp = `import React from 'react';
import { SafeAreaView, Text } from 'react-native';

function App(): React.JSX.Element {
  return (
    <SafeAreaView>
      <Text>rn-bench-app</Text>
    </SafeAreaView>
  );
}

export default App;
`

// ===========================================================================
// SUITE 6 — metro (10)
// ===========================================================================

const metroScenarios = [
  { id: 'fx-metro-01', title: 'Unable to resolve a module import', issue: 'Metro fails: unable to resolve module ./src/screens/Home from App.tsx.', log: `${metroPreamble}Unable to resolve module ./src/screens/Home from /src/App.tsx: Module \`./src/screens/Home\` does not exist in the Haste module map.`, broken: { 'src/App.tsx': metroAppImporting('./src/screens/Home') }, healthy: { 'src/App.tsx': metroAppImporting('./src/screens/HomeScreen') }, mustContain: ["import HomeScreen from './src/screens/HomeScreen';"], auto: false },
  { id: 'fx-metro-02', title: 'Missing package — forgot npm install', issue: 'Metro fails: the package react-native-vector-icons cannot be resolved.', log: `${metroPreamble}Unable to resolve module react-native-vector-icons from /src/components/Icon.tsx: react-native-vector-icons could not be found within the project.`, broken: metroPkgWithout('react-native-vector-icons'), healthy: metroPkgWith('react-native-vector-icons', '^10.1.0'), mustContain: ['"react-native-vector-icons"'], auto: false },
  { id: 'fx-metro-03', title: 'Haste module naming collision', issue: 'Metro fails: haste module naming collision between two files.', log: `${metroPreamble}jest-haste-map: Haste module naming collision: Duplicate module name: App — the following files share their base name:\n  /src/App.tsx\n  /src/components/App.tsx`, broken: {}, healthy: {}, mustContain: [], auto: false },
  { id: 'fx-metro-04', title: 'Syntax error in a TSX file', issue: 'Metro fails with a syntax error while transforming a screen.', log: `${metroPreamble}SyntaxError: /src/screens/HomeScreen.tsx: Unexpected token. Did you mean to use JSX syntax? (7:8)`, broken: {}, healthy: {}, mustContain: [], auto: false },
  { id: 'fx-metro-05', title: 'Babel preset not found', issue: 'Metro fails: babel-preset-expo cannot be found.', log: `${metroPreamble}Cannot find module 'babel-preset-expo' — the babel.config.js references a preset that is not installed.`, broken: metroPkgWithoutDev('babel-preset-expo'), healthy: metroPkgWithDev('babel-preset-expo', '^10.0.0'), mustContain: ['"babel-preset-expo"'], auto: false },
  { id: 'fx-metro-06', title: 'Metro port 8081 already in use', issue: 'Metro refuses to start: port 8081 is already in use.', log: `error: listen EADDRINUSE: address already in use :::8081\nMetro Bundler cannot listen on port 8081 — it is already in use by another process.`, broken: {}, healthy: {}, mustContain: [], auto: false },
  { id: 'fx-metro-07', title: 'Asset not found (missing image)', issue: 'Metro fails: the referenced image asset does not exist.', log: `${metroPreamble}Asset ./src/assets/logo.png does not exist — the require/import path points to a file that was deleted or renamed.`, broken: {}, healthy: {}, mustContain: [], auto: false },
  { id: 'fx-metro-08', title: 'JavaScript heap out of memory', issue: 'Metro crashes with a JavaScript heap out of memory error on a large graph.', log: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`, broken: metroPkgStart('react-native start'), healthy: metroPkgStart('NODE_OPTIONS=--max-old-space-size=4096 react-native start'), mustContain: ['NODE_OPTIONS=--max-old-space-size=4096'], auto: false },
  { id: 'fx-metro-09', title: 'Watchman failure on a large workspace', issue: 'Metro fails to start: watchman recrawl or too many open files.', log: `${metroPreamble}Watchman error: recrawl triggered. Watchman was unable to crawl the workspace: EMFILE: too many open files.`, broken: {}, healthy: {}, mustContain: [], auto: false },
  { id: 'fx-metro-10', title: 'Monorepo package entry point not found', issue: 'Metro fails: a workspace package main field does not resolve.', log: `${metroPreamble}The package "shared-ui" could not be found within its "main" field — did not resolve to a node_modules path.`, broken: {}, healthy: {}, mustContain: [], auto: false },
]

for (const v of metroScenarios) {
  S.push({
    id: v.id,
    suite: 'metro',
    title: v.title,
    issue: v.issue,
    log: v.log,
    broken: v.id === 'fx-metro-06' ? {} : v.broken,
    healthy: v.id === 'fx-metro-06' ? {} : v.healthy,
    expect: {
      diagnosisId: metroDiagId(v.id),
      diagnosisKeywords: [],
      fixFile: v.id === 'fx-metro-02' || v.id === 'fx-metro-05' || v.id === 'fx-metro-08' ? 'package.json' : 'src/App.tsx',
      mustContain: v.mustContain,
      mustNotContain: [],
      autoFixable: v.auto,
    },
  })
}

function metroAppImporting(specifier) {
  return `import React from 'react';
import { SafeAreaView, Text } from 'react-native';
import HomeScreen from '${specifier}';

function App(): React.JSX.Element {
  return (
    <SafeAreaView>
      <Text>rn-bench-app</Text>
    </SafeAreaView>
  );
}

export default App;
`
}

function metroPkgWith(pkg, version) {
  const p = JSON.parse(brokenAppPkg())
  p.dependencies[pkg] = version
  return { 'package.json': JSON.stringify(p, null, 2) }
}
function metroPkgWithout(pkg) {
  return { 'package.json': brokenAppPkg() }
}
function metroPkgWithDev(pkg, version) {
  const p = JSON.parse(brokenAppPkg())
  p.devDependencies[pkg] = version
  return { 'package.json': JSON.stringify(p, null, 2) }
}
function metroPkgWithoutDev(pkg) {
  return { 'package.json': brokenAppPkg() }
}
function metroPkgStart(start) {
  const p = JSON.parse(brokenAppPkg())
  p.scripts.start = start
  return { 'package.json': JSON.stringify(p, null, 2) }
}

function brokenAppPkg() {
  return JSON.stringify({
  name: 'rn-bench-app',
  version: '1.0.0',
  private: true,
  scripts: { start: 'react-native start', android: 'react-native run-android', ios: 'react-native run-ios', test: 'jest', typecheck: 'tsc --noEmit', lint: 'eslint .' },
  dependencies: { react: '18.2.0', 'react-native': '0.74.0' },
  devDependencies: {
    '@babel/core': '7.24.9', '@babel/preset-env': '7.24.8', '@babel/preset-typescript': '7.24.7',
    '@types/jest': '29.5.14', '@types/react': '18.2.79', '@typescript-eslint/eslint-plugin': '6.21.0',
    '@typescript-eslint/parser': '6.21.0', 'babel-jest': '29.7.0', eslint: '8.57.0', jest: '29.7.0',
    'react-test-renderer': '18.2.0', typescript: '5.5.4',
  },
  jest: { preset: 'react-native' },
}, null, 2)
}

function metroDiagId(id) {
  switch (id) {
    case 'fx-metro-01':
    case 'fx-metro-02':
    case 'fx-metro-10': return 'module-resolution'
    case 'fx-metro-03': return 'haste-collision'
    case 'fx-metro-04': return 'syntax-error'
    case 'fx-metro-05': return 'babel-plugin-missing'
    case 'fx-metro-06': return 'port-in-use'
    case 'fx-metro-07': return 'asset-not-found'
    case 'fx-metro-08': return 'out-of-memory'
    case 'fx-metro-09': return 'file-watching'
    default: return 'module-resolution'
  }
}

// ===========================================================================
// SUITE 7 — hermes (10)
// ===========================================================================

const hermesScenarios = [
  { id: 'fx-hermes-01', title: 'Hermes engine could not be resolved (Android)', issue: 'Android build fails: hermes-engine artifact cannot be resolved.', log: `${gradleDepPreamble}\nCould not resolve com.facebook.react:hermes-android:0.74.0.` },
  { id: 'fx-hermes-02', title: 'hermesc failed during the JS bundle compile', issue: 'Build fails: hermesc returns a non-zero exit while compiling the bundle.', log: `${gradleDepPreamble}\nExecution failed for task ':app:createBundleDebugJsAndAssets'.\n> hermesc failed: Command failed with exit code 1.` },
  { id: 'fx-hermes-03', title: 'Hermes bytecode toolchain mismatch', issue: 'Android build fails: hermes-engine version does not match react-native.', log: `${gradleDepPreamble}\nCould not resolve hermes-engine@0.74.0 — the version does not match the react-native version.` },
  { id: 'fx-hermes-04', title: 'Hermes disabled but engine still required', issue: 'Android build fails: hermesEnabled is off but the engine is still requested.', log: `${gradleDepPreamble}\nCould not resolve project :hermes-engine. Hermes is disabled but a dependency still requests it.`, broken: { 'android/gradle.properties': `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g\nandroid.useAndroidX=true\nandroid.enableJetifier=true\nhermesEnabled=false\n` }, healthy: { 'android/gradle.properties': `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g\nandroid.useAndroidX=true\nandroid.enableJetifier=true\nhermesEnabled=true\n` }, fixFile: 'android/gradle.properties', mustContain: ['hermesEnabled=true'], mustNotContain: ['hermesEnabled=false'], auto: true },
  { id: 'fx-hermes-05', title: 'Hermes artifact corrupted in the Gradle cache', issue: 'Android build fails after a corrupted hermes-engine download.', log: `${gradleDepPreamble}\nCould not resolve com.facebook.react:hermes-android:0.74.0.\n  Could not HEAD https://repo.maven.apache.org/...: checksum failed.` },
  { id: 'fx-hermes-06', title: 'Hermes engine requested for iOS pods', issue: 'pod install fails: the Hermes pod cannot be found.', log: `Analyzing dependencies\n[!] Unable to find a specification for "hermes-engine".`, diag: 'pod-not-found' },
  { id: 'fx-hermes-07', title: 'hermesc missing from the toolchain', issue: 'The build cannot find hermesc in the toolchain.', log: `${gradleDepPreamble}\n> Task :app:createBundleDebugJsAndAssets FAILED\nCould not find hermesc.` },
  { id: 'fx-hermes-08', title: 'Hermes bytecode compile error in a transformed file', issue: 'Build fails while hermesc compiles the JS bundle.', log: `${gradleDepPreamble}\nhermesc: Compilation of the JavaScript bundle failed with a SyntaxError.` },
  { id: 'fx-hermes-09', title: 'Hermes engine ABI mismatch', issue: 'Android build fails: no matching variant of hermes-android for arm64.', log: `${gradleDepPreamble}\nNo matching variant of com.facebook.react:hermes-android:0.74.0 was found. The consumer was configured to find a runtime of a component compatible with Java 11.` },
  { id: 'fx-hermes-10', title: 'Hermes flag flipped after an RN upgrade', issue: 'After upgrading RN, the build fails looking for hermes-engine.', log: `${gradleDepPreamble}\nCould not resolve hermes-engine:1.0.0.`, fixFile: 'package.json', mustContain: ['"hermes-engine": "0.74.0"'], mustNotContain: ['"hermes-engine": "1.0.0"'], auto: true },
]

for (const v of hermesScenarios) {
  S.push({
    id: v.id,
    suite: 'hermes',
    title: v.title,
    issue: v.issue,
    log: v.log,
    broken: v.id === 'fx-hermes-10' ? { 'package.json': hermesPkgWrong() } : v.broken ?? {},
    healthy: v.id === 'fx-hermes-10' ? { 'package.json': hermesPkgAligned() } : v.healthy ?? {},
    expect: {
      diagnosisId: v.diag ?? 'hermes-android',
      diagnosisKeywords: ['hermes'],
      fixFile: v.fixFile ?? 'ios/Podfile',
      mustContain: v.mustContain ?? [],
      mustNotContain: v.mustNotContain ?? [],
      autoFixable: v.auto ?? false,
    },
  })
}

function hermesPkgWrong() {
  const p = JSON.parse(brokenAppPkg())
  p.dependencies['hermes-engine'] = '1.0.0'
  return JSON.stringify(p, null, 2)
}
function hermesPkgAligned() {
  const p = JSON.parse(brokenAppPkg())
  p.dependencies['hermes-engine'] = '0.74.0'
  return JSON.stringify(p, null, 2)
}

// ===========================================================================
// SUITE 8 — upgrade (10)
// ===========================================================================

const upgradeVariants = [
  { id: 'fx-upgrade-01', title: 'RN 0.76 upgrade: compileSdkVersion still 34 (needs 35)', issue: 'After upgrading to RN 0.76, the Android build fails — compileSdkVersion is below the requirement.', field: 'compileSdkVersion', cur: '34', fix: '35', sdk: 35, rn: '0.76.0', id_rc: 'compile-sdk-version', auto: true },
  { id: 'fx-upgrade-02', title: 'RN 0.76 upgrade: Kotlin still 1.9.0 (needs 1.9.24)', issue: 'After upgrading to RN 0.76, Kotlin compilation fails — the Kotlin plugin is below the required version.', field: 'kotlinVersion', cur: '1.9.0', fix: '1.9.24', sdk: 35, rn: '0.76.0', id_rc: 'kotlin-version', auto: true },
  { id: 'fx-upgrade-03', title: 'RN 0.76 upgrade: AGP still 8.4.1 (needs 8.6.0)', issue: 'After upgrading to RN 0.76, the Android build fails at configuration — AGP is below the template pin.', field: 'agp', cur: '8.4.1', fix: '8.6.0', sdk: 35, rn: '0.76.0', id_rc: 'agp-version', auto: true },
  { id: 'fx-upgrade-04', title: 'RN 0.76 upgrade: Gradle wrapper still 8.8 (needs 8.10.2)', issue: 'After upgrading to RN 0.76, Gradle sync fails — the wrapper is below the required version.', field: 'gradle', cur: '8.8', fix: '8.10.2', sdk: 35, rn: '0.76.0', id_rc: 'gradle-wrapper-version', auto: true },
  { id: 'fx-upgrade-05', title: 'RN 0.73 upgrade: compileSdkVersion still 33 (needs 34)', issue: 'After upgrading to RN 0.73, the Android build fails on the SDK version.', field: 'compileSdkVersion', cur: '33', fix: '34', sdk: 34, rn: '0.73.0', id_rc: 'compile-sdk-version', auto: true },
  { id: 'fx-upgrade-06', title: 'RN 0.74 upgrade: Kotlin still 1.8.22 (needs 1.9.0)', issue: 'After upgrading to RN 0.74, Kotlin fails to compile a native module.', field: 'kotlinVersion', cur: '1.8.22', fix: '1.9.0', sdk: 34, rn: '0.74.0', id_rc: 'kotlin-version', auto: true },
  { id: 'fx-upgrade-07', title: 'RN 0.71 upgrade: Gradle wrapper still 7.5.1 (needs 7.5.1 — ok) with AGP below', issue: 'After upgrading to RN 0.71, the Android build fails with an AGP warning.', field: 'agp', cur: '7.0.4', fix: '7.3.1', sdk: 33, rn: '0.71.0', id_rc: 'agp-version', auto: true },
  { id: 'fx-upgrade-08', title: 'RN 0.73 upgrade: minSdkVersion still 21 (needs 23)', issue: 'After upgrading to RN 0.73, the manifest merger fails on minSdkVersion.', field: 'minSdkVersion', cur: '21', fix: '23', sdk: 34, rn: '0.73.0', id_rc: 'min-sdk-version', auto: true },
  { id: 'fx-upgrade-09', title: 'RN 0.76 upgrade: NDK version still 25.1', issue: 'After upgrading to RN 0.76, the Android build fails on the NDK version.', field: 'ndk', cur: '25.1.8937393', fix: '26.1.10909125', sdk: 35, rn: '0.76.0', id_rc: 'ndk-version', auto: false, log: `${gradleDepPreamble}\n* What went wrong:\nNDK at /Users/dev/Library/Android/sdk/ndk/25.1.8937393 did not have a source.properties file (React Native 0.76 requires 26.1.10909125).` },
  { id: 'fx-upgrade-10', title: 'RN 0.76 upgrade: AGP-8 namespace missing from app build.gradle', issue: 'After upgrading to RN 0.76 (AGP 8), the build fails: namespace not specified.', field: 'namespace', cur: '', fix: 'com.rnbenchapp', sdk: 35, rn: '0.76.0', id_rc: 'agp-namespace', auto: true },
]

for (const v of upgradeVariants) {
  const broken = upgradeBuildGradle(v)
  const healthy = upgradeHealthy(v)
  S.push({
    id: v.id,
    suite: 'upgrade',
    title: v.title,
    issue: v.issue,
    log: v.log ?? (v.id_rc === 'agp-namespace'
      ? `${gradleDepPreamble}\n* What went wrong:\nNamespace not specified. Please specify a namespace in the module's build file.`
      : v.id_rc === 'min-sdk-version'
        ? `${gradleDepPreamble}\nuses-sdk:minSdkVersion 21 cannot be smaller than version 23 declared in library [react-native].`
        : undefined),
    broken,
    healthy,
    expect: {
      diagnosisId: v.id_rc,
      diagnosisKeywords: [],
      fixFile: v.field === 'namespace' ? 'android/app/build.gradle' : v.field === 'gradle' ? 'android/gradle/wrapper/gradle-wrapper.properties' : 'android/build.gradle',
      mustContain: v.field === 'namespace' ? ['namespace "com.rnbenchapp"'] : [v.field === 'agp' ? `gradle:${v.fix}` : v.field === 'gradle' ? `gradle-${v.fix}-bin.zip` : upgradeFieldValue(v.field, v.fix)],
      mustNotContain: v.field === 'namespace' ? [] : [v.field === 'agp' ? `gradle:${v.cur}` : v.field === 'gradle' ? `gradle-${v.cur}-bin.zip` : upgradeFieldValue(v.field, v.cur)],
      autoFixable: v.auto,
    },
  })
}

// String-valued gradle ext fields are quoted in the file; numeric ones are not.
// The generator's 'ndk' shorthand maps to the gradle attribute ndkVersion.
function upgradeFieldValue(field, value) {
  const attr = field === 'ndk' ? 'ndkVersion' : field
  return field === 'kotlinVersion' || field === 'ndk' ? `${attr} = "${value}"` : `${attr} = ${value}`
}

function upgradeBuildGradle(v) {
  const kotlin = kotlinVersionFor(v.rn)
  const agp = agpVersionFor(v.rn)
  const gradle = gradleVersionFor(v.rn)
  const curSdk = v.field === 'compileSdkVersion' ? v.cur : v.sdk
  const curKotlin = v.field === 'kotlinVersion' ? v.cur : kotlin
  const curAgp = v.field === 'agp' ? v.cur : agp
  const curGradle = v.field === 'gradle' ? v.cur : gradle
  const curMinSdk = v.field === 'minSdkVersion' ? v.cur : '23'
  const curNdk = v.field === 'ndk' ? v.cur : '26.1.10909125'
  return {
    'package.json': kotlinPkg(v.rn),
    'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = ${curMinSdk}
        compileSdkVersion = ${curSdk}
        targetSdkVersion = ${curSdk}
        ndkVersion = "${curNdk}"
        kotlinVersion = "${curKotlin}"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:${curAgp}")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${curKotlin}")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`,
    'android/gradle/wrapper/gradle-wrapper.properties': `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${curGradle}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`,
    'android/app/build.gradle': v.field === 'namespace'
      ? `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`
      : `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
}

android {
    namespace "com.rnbenchapp"
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`,
  }
}

function upgradeHealthy(v) {
  const broken = upgradeBuildGradle(v)
  if (v.field === 'namespace') {
    broken['android/app/build.gradle'] = `apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

react {
}

android {
    namespace "com.rnbenchapp"
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`
    return broken
  }
  const kotlin = kotlinVersionFor(v.rn)
  const agp = agpVersionFor(v.rn)
  const gradle = gradleVersionFor(v.rn)
  const content = broken['android/build.gradle']
  broken['android/build.gradle'] = content
    .replace(`compileSdkVersion = ${v.field === 'compileSdkVersion' ? v.cur : v.sdk}`, `compileSdkVersion = ${v.field === 'compileSdkVersion' ? v.fix : v.sdk}`)
    .replace(`kotlinVersion = "${v.field === 'kotlinVersion' ? v.cur : kotlin}"`, `kotlinVersion = "${v.field === 'kotlinVersion' ? v.fix : kotlin}"`)
    .replace(`gradle:${v.field === 'agp' ? v.cur : agp}`, `gradle:${v.field === 'agp' ? v.fix : agp}`)
    .replace(`kotlin-gradle-plugin:${v.field === 'kotlinVersion' ? v.cur : kotlin}`, `kotlin-gradle-plugin:${v.field === 'kotlinVersion' ? v.fix : kotlin}`)
    .replace(`minSdkVersion = ${v.field === 'minSdkVersion' ? v.cur : '23'}`, `minSdkVersion = ${v.field === 'minSdkVersion' ? v.fix : '23'}`)
    .replace(`ndkVersion = "${v.field === 'ndk' ? v.cur : '26.1.10909125'}"`, `ndkVersion = "${v.field === 'ndk' ? v.fix : '26.1.10909125'}"`)
  if (v.field === 'gradle') {
    broken['android/gradle/wrapper/gradle-wrapper.properties'] = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${v.fix}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`
  }
  return broken
}

// ===========================================================================
// SUITE 9 — linking (10)
// ===========================================================================

const linkingScenarios = [
  { id: 'fx-link-01', title: 'Native module not linked: settings.gradle missing the include', issue: 'Android build fails: the native module project is not included in settings.gradle.', log: `${gradleDepPreamble}\n* What went wrong:\nExecution failed for task ':app:processDebugMainManifest'.\n> Could not find module ':react-native-vector-icons'.`, diag: 'dependency-resolution', fixFile: 'android/settings.gradle', mustContain: [`include ':react-native-vector-icons'`] },
  { id: 'fx-link-02', title: 'Autolinking failed for react-native-maps', issue: 'Android build fails: react-native-maps cannot be found by autolinking.', log: `${gradleDepPreamble}\nCould not resolve project :react-native-maps.`, diag: 'dependency-resolution', fixFile: 'android/settings.gradle', mustContain: [`include ':react-native-maps'`] },
  { id: 'fx-link-03', title: 'Pod not installed after adding a native package', issue: 'iOS build fails: the pod for the new native module is missing.', log: `[!] CocoaPods could not find compatible versions for pod "react-native-vision-camera":\n  In Podfile:\n    react-native-vision-camera (from \`../node_modules/react-native-vision-camera\`)\n\n[!] The Swift pod \`react-native-vision-camera\` could not be found in project ios/Podfile — run pod install after adding the package.`, diag: 'pod-install-needed', fixFile: 'ios/Podfile', mustContain: [`pod 'react-native-vision-camera'`] },
  { id: 'fx-link-04', title: 'Native module requires a higher minSdkVersion', issue: 'Android build fails: the native module requires a higher Android minimum.', log: `${gradlePreamble}\nuses-sdk:minSdkVersion 21 cannot be smaller than version 24 declared in library [react-native-vision-camera].`, minSdk: '21', fix: '24' },
  { id: 'fx-link-05', title: 'MainApplication missing the package import', issue: 'Android build fails: the native module package is not registered in MainApplication.', log: `${gradleDepPreamble}\n* What went wrong:\nExecution failed for task ':app:mergeDebugNativeLibs'.\n> Could not find class com.microsoft.codepush.react.CodePushPackage.`, diag: 'dependency-resolution' },
  { id: 'fx-link-06', title: 'Duplicate class from two native modules', issue: 'Android build fails: two native modules ship the same class.', log: `${gradleDepPreamble}\nDuplicate class com.rt2zz.reactnativecontacts.ReactNativeContacts found in modules react-native-contacts and react-native-addressbook.`, diag: 'duplicate-class' },
  { id: 'fx-link-07', title: 'Native module needs a Gradle repository it does not declare', issue: 'Android build fails: a native module artifact cannot be resolved from the configured repositories.', log: `${gradleDepPreamble}\nCould not resolve com.github.wix:detox:20.18.1 — the repository is not declared in settings.gradle.`, diag: 'dependency-resolution', fixFile: 'android/settings.gradle', mustContain: ['jitpack.io'] },
  { id: 'fx-link-08', title: 'New Architecture mismatch for a native module', issue: 'Android build fails: a native module does not support the new architecture.', log: `${gradleDepPreamble}\nThe module 'react-native-screens' does not support the new architecture. Please set newArchEnabled=false.`, diag: 'new-arch-mismatch', fixFile: 'android/gradle.properties', mustContain: ['newArchEnabled=false'] },
  { id: 'fx-link-09', title: 'JSI module requires a specific NDK', issue: 'Android build fails: a JSI module requires a newer NDK.', log: `${gradleDepPreamble}\nNDK at /Users/dev/Library/Android/sdk/ndk/25.1.8937393 did not have a source.properties file (required by react-native-reanimated).`, diag: 'ndk-version', ndk: '25.1.8937393', fixFile: 'android/build.gradle', mustContain: [`ndkVersion = "26.1.10909125"`], mustNotContain: [`ndkVersion = "25.1.8937393"`] },
  { id: 'fx-link-10', title: 'CocoaPods cannot resolve a native pod from the local path', issue: 'pod install fails: the pod path for a local native module is wrong.', log: `[!] Unable to find a specification for \`RNReanimated\` — the local path ../node_modules/react-native-reanimated does not contain a podspec.`, diag: 'pod-not-found', fixFile: 'ios/Podfile', mustContain: [`pod 'RNReanimated'`] },
]

for (const v of linkingScenarios) {
  const isMinSdk = v.id === 'fx-link-04'
  const isNdk = v.id === 'fx-link-09'
  S.push({
    id: v.id,
    suite: 'linking',
    title: v.title,
    issue: v.issue,
    log: v.log,
    broken: isMinSdk ? { 'android/build.gradle': gradleFixture(v.minSdk) } : isNdk ? { 'android/build.gradle': gradleFixture(23, v.ndk) } : {},
    healthy: isMinSdk ? { 'android/build.gradle': gradleFixture(v.fix) } : isNdk ? { 'android/build.gradle': gradleFixture(23, '26.1.10909125') } : {},
    expect: {
      diagnosisId: v.diag ?? (isMinSdk ? 'min-sdk-version' : 'pod-install-needed'),
      diagnosisKeywords: [],
      fixFile: v.fixFile ?? 'android/build.gradle',
      mustContain: v.mustContain ?? (isMinSdk ? [`minSdkVersion = ${v.fix}`] : []),
      mustNotContain: v.mustNotContain ?? (isMinSdk ? [`minSdkVersion = ${v.minSdk}`] : []),
      autoFixable: isMinSdk || isNdk || !!v.mustContain,
    },
  })
}

function gradleFixture(minSdk, ndk) {
  return `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = ${minSdk}
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "${ndk ?? '26.1.10909125'}"
        kotlinVersion = "1.9.0"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.1")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`
}

// ===========================================================================
// SUITE 10 — typescript (10)
// ===========================================================================

const tsScenarios = [
  { id: 'fx-ts-01', title: 'TS2307: Cannot find module after a refactor', issue: 'Typecheck fails: a module import no longer resolves.', code: `import { HomeScreen } from './src/screens/Home';`, err: 'TS2307: Cannot find module \'./src/screens/Home\'.', fix: `import { HomeScreen } from './src/screens/HomeScreen';` },
  { id: 'fx-ts-02', title: 'TS2304: Cannot find name (dropped import)', issue: 'Typecheck fails: a name used in a component is not in scope.', code: `export function Screen() { return <Text>{AppName}</Text>; }`, err: 'TS2304: Cannot find name \'AppName\'.', fix: `export function Screen() { return <Text>rn-bench-app</Text>; }` },
  { id: 'fx-ts-03', title: 'TS2339: Property does not exist after an RN upgrade', issue: 'After upgrading RN, a deprecated prop no longer exists on the type.', code: `const c = (el) => el.getNativeNode();`, err: 'TS2339: Property \'getNativeNode\' does not exist on type \'Text\'.', fix: `const c = (el) => el;` },
  { id: 'fx-ts-04', title: 'TS2322: Type not assignable (state type tightened)', issue: 'Typecheck fails: a value no longer matches the declared state type.', code: `const [count, setCount] = useState<number>(0);\nsetCount('5');`, codeLine: 2, err: 'TS2322: Type \'string\' is not assignable to type \'number\'.', fix: `const [count, setCount] = useState<number>(0);\nsetCount(5);` },
  { id: 'fx-ts-05', title: 'TS2739: Missing required props at a call site', issue: 'Typecheck fails: a component gained a required prop and a call site missed it.', code: `const x = <Card />;`, err: 'TS2739: Type \'{}\' is missing the following properties from type \'CardProps\': title.', fix: `const x = <Card title="Hello" />;` },
  { id: 'fx-ts-06', title: 'TS2305: No exported member (renamed export)', issue: 'Typecheck fails: a named export was renamed.', code: `import { authApi } from './services/auth';`, err: 'TS2305: Module \'./services/auth\' has no exported member \'authApi\'.', fix: `import { authService } from './services/auth';` },
  { id: 'fx-ts-07', title: 'TS2300: Duplicate identifier from a merge conflict', issue: 'Typecheck fails: a merge conflict left two declarations.', code: `const total = 1;\nconst total = 2;`, codeLine: 2, err: 'TS2300: Duplicate identifier \'total\'.', fix: `const total = 2;` },
  { id: 'fx-ts-08', title: 'TS17004: Cannot use JSX in a .ts file', issue: 'Typecheck fails: JSX is used in a file the tsconfig treats as plain TS.', code: `const el = <Text>hi</Text>;`, err: 'TS17004: Cannot use JSX unless the \'--jsx\' flag is provided.', fix: `const el = React.createElement(Text, null, 'hi');` },
  { id: 'fx-ts-09', title: 'TS2322: Unknown prop passed to a component', issue: 'Typecheck fails: a prop is passed the component does not accept.', code: `const x = <Text accessibilityRole="header">Hi</Text>;`, err: 'TS2322: Type \'{ accessibilityRole: string }\' is not assignable to type \'TextProps\'.', fix: `const x = <Text>Hi</Text>;` },
  { id: 'fx-ts-10', title: 'TS7006: Parameter implicitly has an any type', issue: 'Typecheck fails in strict mode: a parameter has no type.', code: `export function handler(e) { return e; }`, err: 'TS7006: Parameter \'e\' implicitly has an \'any\' type.', fix: `export function handler(e: Event) { return e; }` },
]

for (const v of tsScenarios) {
  S.push({
    id: v.id,
    suite: 'typescript',
    title: v.title,
    issue: v.issue,
    log: `node_modules/.bin/tsc --noEmit

src/screens/Broken.tsx(${3 + (v.codeLine ?? 1)},10): error ${v.err}
`,
    broken: { 'src/screens/Broken.tsx': `import React from 'react';\nimport { Text } from 'react-native';\n\n${v.code}\n` },
    healthy: { 'src/screens/Broken.tsx': `import React from 'react';\nimport { Text } from 'react-native';\n\n${v.fix}\n` },
    expect: {
      diagnosisId: tsDiagId(v.id),
      diagnosisKeywords: [],
      fixFile: 'src/screens/Broken.tsx',
      mustContain: [v.fix.trim()],
      mustNotContain: [],
      autoFixable: false,
    },
  })
}

function tsDiagId(id) {
  switch (id) {
    case 'fx-ts-01': return 'ts-module-not-found'
    case 'fx-ts-02': return 'ts-cannot-find-name'
    case 'fx-ts-03': return 'ts-property-not-exist'
    case 'fx-ts-04': return 'ts-type-not-assignable'
    case 'fx-ts-05': return 'ts-missing-props'
    case 'fx-ts-06': return 'ts-no-exported-member'
    case 'fx-ts-07': return 'ts-duplicate-identifier'
    case 'fx-ts-08': return 'ts-jsx-not-supported'
    case 'fx-ts-09': return 'ts-type-not-assignable'
    case 'fx-ts-10': return 'ts-this-expression'
    default: return 'ts-module-not-found'
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true })
const counts = {}
for (const scenario of S) {
  const file = join(OUT, `${scenario.id}.json`)
  writeFileSync(file, JSON.stringify({
    id: scenario.id,
    specVersion: 1,
    suite: scenario.suite,
    title: scenario.title,
    issue: scenario.issue,
    ...(scenario.log ? { log: scenario.log } : {}),
    broken: scenario.broken,
    healthy: scenario.healthy,
    expect: scenario.expect,
  }, null, 2) + '\n')
  counts[scenario.suite] = (counts[scenario.suite] || 0) + 1
}

console.log(`Wrote ${S.length} fix-bench scenarios to bench/fix/`)
for (const [suite, n] of Object.entries(counts)) console.log(`  ${suite}: ${n}`)
