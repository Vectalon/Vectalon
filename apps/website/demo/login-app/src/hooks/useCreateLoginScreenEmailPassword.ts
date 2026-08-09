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
