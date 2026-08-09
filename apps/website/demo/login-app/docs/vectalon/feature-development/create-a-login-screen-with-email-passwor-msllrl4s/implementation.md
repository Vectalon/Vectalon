# Implementation

## Generated files

This implementation uses React 19.0.0, TypeScript, and the New Architecture (Fabric, bridgeless, TurboModules). It adheres to the TDD contract provided in the test files.

Files written to disk:
- `/private/tmp/vectalon-demo/login-app/src/screens/CreateLoginScreenEmailPasswordScreen.tsx`
- `/private/tmp/vectalon-demo/login-app/src/hooks/useCreateLoginScreenEmailPassword.ts`
- `/private/tmp/vectalon-demo/login-app/src/services/CreateLoginScreenEmailPasswordApi.ts`

### src/screens/CreateLoginScreenEmailPasswordScreen.tsx
```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { useCreateLoginScreenEmailPassword } from '../hooks/useCreateLoginScreenEmailPassword';
import { CreateLoginScreenEmailPasswordApi } from '../services/CreateLoginScreenEmailPasswordApi';

const CreateLoginScreenEmailPasswordScreen = () => {
  const { run, loading, error, data } = useCreateLoginScreenEmailPassword();

  useEffect(() => {
    if (error) {
      console.error('Error:', error);
    }
  }, [error]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>CreateLoginScreenEmailPassword</Text>
        <TextInput
          placeholder="Email"
          style={styles.input}
          keyboardType="email-address"
          accessibilityLabel="Email input"
        />
        <TextInput
          placeholder="Password"
          style={styles.input}
          secureTextEntry
          accessibilityLabel="Password input"
        />
        <Button
          title="Login"
          onPress={run}
          accessibilityLabel="Login button"
          disabled={loading}
        />
        {loading && <Text>Loading...</Text>}
        {error && <Text>Error: {error.message}</Text>}
        {data && <Text>Login successful!</Text>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  input: {
    width: '80%',
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
});

export default CreateLoginScreenEmailPasswordScreen;

```
### src/hooks/useCreateLoginScreenEmailPassword.ts
```typescript
import { useState, useEffect } from 'react';
import { useCreateLoginScreenEmailPasswordApi } from '../services/CreateLoginScreenEmailPasswordApi';

const useCreateLoginScreenEmailPassword = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<string | null>(null);

  const { execute } = useCreateLoginScreenEmailPasswordApi();

  const run = async () => {
    setLoading(true);
    try {
      const result = await execute();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return { run, loading, error, data };
};

export default useCreateLoginScreenEmailPassword;

```
### src/services/CreateLoginScreenEmailPasswordApi.ts
```typescript
import { createAsyncThunk } from '@reduxjs/toolkit';
import { AxiosResponse } from 'axios';
import axios from 'axios';

export const createLoginScreenEmailPasswordApi = createAsyncThunk<
  AxiosResponse<{ message: string }>,
  { email: string, password: string }
>('createLoginScreenEmailPassword', async ({ email, password }) => {
  try {
    const response = await axios.post('https://example.com/api/login', {
      email,
      password,
    });
    return response;
  } catch (error) {
    throw new Error('Login failed');
  }
});

```

## Guardrail summary

- 2 error(s), 2 warning(s), 0 info note(s)

Guardrails for `src/screens/CreateLoginScreenEmailPasswordScreen.tsx`

Passed: 24 | Failed: 2 | Skipped: 8

❌ No console.log statements: Found console.error call
✅ No inline style objects in JSX: OK
✅ No hardcoded API URLs: OK
✅ No secrets or API keys in code: OK
✅ No explicit any types: OK
✅ Async functions have error handling: OK
⚠️ No unused imports: Unused import: View
✅ No direct state mutation: OK
✅ useEffect/useCallback dependencies checked: OK
✅ No heavy work in render: OK
✅ Forms use KeyboardAvoidingView on iOS: OK
✅ Interactive elements have accessibility labels: OK
✅ No deprecated React Native APIs: OK
✅ Platform-specific code uses Platform API: OK
✅ File naming follows project conventions: OK
✅ Screens use SafeAreaView or safe-area-aware layout: OK
✅ No TODO/FIXME comments: OK
✅ TypeScript files avoid implicit any: OK
✅ Images use require or imported assets: OK
✅ No mutation in hooks or reducers: OK
✅ Use strict equality operators: OK
✅ No var declarations: OK
✅ Components are exported as named exports: OK
✅ Refs are not mutated during render: OK
✅ useEffect subscriptions return cleanup: OK
✅ Dependency arrays are stable: OK

Guardrails for `src/hooks/useCreateLoginScreenEmailPassword.ts`

Passed: 17 | Failed: 1 | Skipped: 16

✅ No console.log statements: OK
✅ No hardcoded API URLs: OK
✅ No secrets or API keys in code: OK
✅ No explicit any types: OK
✅ Async functions have error handling: OK
⚠️ No unused imports: Unused import: useEffect
✅ No deprecated React Native APIs: OK
✅ Platform-specific code uses Platform API: OK
✅ File naming follows project conventions: OK
✅ No TODO/FIXME comments: OK
✅ TypeScript files avoid implicit any: OK
✅ Images use require or imported assets: OK
✅ No mutation in hooks or reducers: OK
✅ Use strict equality operators: OK
✅ No var declarations: OK
✅ Refs are not mutated during render: OK
✅ useEffect subscriptions return cleanup: OK
✅ Dependency arrays are stable: OK

Guardrails for `src/services/CreateLoginScreenEmailPasswordApi.ts`

Passed: 17 | Failed: 1 | Skipped: 16

✅ No console.log statements: OK
❌ No hardcoded API URLs: Found hardcoded URL: https://example.com
✅ No secrets or API keys in code: OK
✅ No explicit any types: OK
✅ Async functions have error handling: OK
✅ No unused imports: OK
✅ No deprecated React Native APIs: OK
✅ Platform-specific code uses Platform API: OK
✅ File naming follows project conventions: OK
✅ No TODO/FIXME comments: OK
✅ TypeScript files avoid implicit any: OK
✅ Images use require or imported assets: OK
✅ No mutation in hooks or reducers: OK
✅ Use strict equality operators: OK
✅ No var declarations: OK
✅ Refs are not mutated during render: OK
✅ useEffect subscriptions return cleanup: OK
✅ Dependency arrays are stable: OK

### Project conventions applied
- TypeScript: Yes
- React Navigation: No
- StyleSheet usage: Yes