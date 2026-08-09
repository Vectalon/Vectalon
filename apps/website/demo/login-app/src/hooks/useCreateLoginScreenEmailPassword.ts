// src/hooks/useCreateLoginScreenEmailPassword.ts
import { useCallback, useState } from 'react';
import { createLoginScreenEmailPasswordApi } from '../services/CreateLoginScreenEmailPasswordApi';

interface UseCreateLoginScreenEmailPasswordResult {
  loading: boolean;
  error: Error | null;
  data: string | null;
  run: (email: string, password: string) => Promise<void>;
}

export function useCreateLoginScreenEmailPassword(): UseCreateLoginScreenEmailPasswordResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<string | null>(null);

  const run = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createLoginScreenEmailPasswordApi.execute(email, password);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, data, run };
}
