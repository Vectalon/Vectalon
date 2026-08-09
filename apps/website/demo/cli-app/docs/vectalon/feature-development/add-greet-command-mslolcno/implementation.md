# Implementation

## Generated files

golden replay: scripted implementation

Files written to disk:
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/cli-app/src/services/AddGreetCommandApi.ts`
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/cli-app/src/hooks/useAddGreetCommand.ts`
- `/Users/bhishaksanyal/Documents/Github/Vectalon/apps/website/demo/cli-app/src/screens/AddGreetCommandScreen.tsx`

### src/services/AddGreetCommandApi.ts
```typescript
export class AddGreetCommandApi {
  async execute(): Promise<string> {
    return 'ok';
  }
}

export const addGreetCommandApi = new AddGreetCommandApi();

```
### src/hooks/useAddGreetCommand.ts
```typescript
import { useState, useCallback } from 'react';
import { addGreetCommandApi } from '../services/AddGreetCommandApi';

interface UseAddGreetCommandState {
  loading: boolean;
  error: Error | null;
  data: string | null;
}

export function useAddGreetCommand(): UseAddGreetCommandState & { run: () => Promise<void> } {
  const [state, setState] = useState<UseAddGreetCommandState>({
    loading: false,
    error: null,
    data: null,
  });

  const run = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await addGreetCommandApi.execute();
      setState({ loading: false, error: null, data });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ loading: false, error, data: null });
    }
  }, []);

  return { ...state, run };
}

```
### src/screens/AddGreetCommandScreen.tsx
```typescript
import React from 'react';
import { Text, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useAddGreetCommand } from '../hooks/useAddGreetCommand';

export function AddGreetCommandScreen(): React.JSX.Element {
  const { run, loading, error, data } = useAddGreetCommand();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AddGreetCommand</Text>
      {error && <Text style={styles.error}>{error.message}</Text>}
      {data && <Text>{data}</Text>}
      <TouchableOpacity
        style={styles.button}
        onPress={run}
        disabled={loading}
        accessibilityLabel="Run AddGreetCommand"
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Run</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },
  error: { color: "#FF3B30", marginBottom: 12 },
  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
});

```

## Guardrail summary

✅ All guardrails passed for every generated file.
### Project conventions applied
- TypeScript: Yes
- React Navigation: No
- StyleSheet usage: No