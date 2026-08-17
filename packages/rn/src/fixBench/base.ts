/**
 * vc fix-bench — the shared healthy base project. Every scenario materializes
 * this realistic RN 0.74 project (bare RN CLI template shape: android/ +
 * ios/ + src/) and then overlays its `broken` files to inject the failure.
 * The base is deliberately healthy against the pipeline's project checks
 * (compileSdk 34 / Kotlin 1.9.0 / AGP 8.4.1 / Gradle 8.8 all meet the RN 0.74
 * requirements), so a false positive on the healthy control is a real one.
 * Business Source License 1.1 (BSL-1.1).
 */

export const FIX_BENCH_BASE: Record<string, string> = {
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
  'tsconfig.json': `{
  "compilerOptions": {
    "strict": true,
    "jsx": "react-native",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "__tests__"]
}
`,
  'babel.config.js': `module.exports = {
  presets: ['@babel/preset-env', '@babel/preset-typescript'],
};
`,
  'index.js': `import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
`,
  'app.json': `{
  "name": "rn-bench-app",
  "displayName": "rn-bench-app"
}
`,
  'metro.config.js': `const { getDefaultConfig } = require('@react-native/metro-config');
module.exports = getDefaultConfig(__dirname);
`,
  'android/settings.gradle': `rootProject.name = 'rn-bench-app'
apply from: file("../node_modules/@react-native-community/cli-platform-android/native_modules.gradle"); applyNativeModulesSettingsGradle(settings)
include ':app'
`,
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
  'android/gradle/wrapper/gradle-wrapper.properties': `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.8-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`,
  'android/gradle.properties': `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g
android.useAndroidX=true
android.enableJetifier=true
`,
  'android/app/build.gradle': `apply plugin: "com.android.application"
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
  'android/app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application android:label="@string/app_name">
        <activity android:name=".MainActivity" />
    </application>
</manifest>
`,
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
  'ios/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>rn-bench-app</string>
  <key>CFBundleIdentifier</key>
  <string>org.rnbench.app</string>
</dict>
</plist>
`,
  'src/App.tsx': `import React from 'react';
import { SafeAreaView, Text } from 'react-native';

function App(): React.JSX.Element {
  return (
    <SafeAreaView>
      <Text>rn-bench-app</Text>
    </SafeAreaView>
  );
}

export default App;
`,
  'src/screens/HomeScreen.tsx': `import React from 'react';
import { View, Text } from 'react-native';

export function HomeScreen(): React.JSX.Element {
  return (
    <View>
      <Text>Home</Text>
    </View>
  );
}
`,
  '__tests__/App.test.tsx': `import React from 'react';
import renderer from 'react-test-renderer';
import App from '../src/App';

it('renders correctly', () => {
  renderer.create(<App />);
});
`,
}
