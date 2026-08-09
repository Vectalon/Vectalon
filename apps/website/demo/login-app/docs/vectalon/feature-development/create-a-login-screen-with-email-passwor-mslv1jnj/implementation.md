# Implementation

## Generated files

golden replay: scripted implementation

Files written to disk:
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/login-app/src/services/CreateLoginScreenEmailPasswordApi.ts`
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/login-app/src/hooks/useCreateLoginScreenEmailPassword.ts`
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/login-app/src/screens/CreateLoginScreenEmailPasswordScreen.tsx`

### src/services/CreateLoginScreenEmailPasswordApi.ts
```typescript
export class CreateLoginScreenEmailPasswordApi {
  async execute(): Promise<string> {
    return 'ok';
  }
}

export const createLoginScreenEmailPasswordApi = new CreateLoginScreenEmailPasswordApi();

```
### src/hooks/useCreateLoginScreenEmailPassword.ts
```typescript
import { useState, useCallback } from 'react';
import { createLoginScreenEmailPasswordApi } from '../services/CreateLoginScreenEmailPasswordApi';

interface UseCreateLoginScreenEmailPasswordState {
  loading: boolean;
  error: Error | null;
  data: string | null;
}

export function useCreateLoginScreenEmailPassword(): UseCreateLoginScreenEmailPasswordState & { run: () => Promise<void> } {
  const [state, setState] = useState<UseCreateLoginScreenEmailPasswordState>({
    loading: false,
    error: null,
    data: null,
  });

  const run = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await createLoginScreenEmailPasswordApi.execute();
      setState({ loading: false, error: null, data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ loading: false, error, data: null });
    }
  }, []);

  return { ...state, run };
}

```
### src/screens/CreateLoginScreenEmailPasswordScreen.tsx
```typescript
import React from 'react';
import { Text, Pressable, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useCreateLoginScreenEmailPassword } from '../hooks/useCreateLoginScreenEmailPassword';

export function CreateLoginScreenEmailPasswordScreen(): React.JSX.Element {
  const { run, loading, error, data } = useCreateLoginScreenEmailPassword();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>CreateLoginScreenEmailPassword</Text>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      {data ? <Text>{data}</Text> : null}
      <Pressable
        style={styles.button}
        onPress={run}
        disabled={loading}
        accessibilityLabel="Run CreateLoginScreenEmailPassword"
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Run</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },
  error: { color: "#FF3B30", marginBottom: 12 },
  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, borderCurve: "continuous", alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
});

```

## Guardrail summary

✅ All guardrails passed for every generated file.
### Project conventions applied
- TypeScript: Yes
- React Navigation: No
- StyleSheet usage: Yes