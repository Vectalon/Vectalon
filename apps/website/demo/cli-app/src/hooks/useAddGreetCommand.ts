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
