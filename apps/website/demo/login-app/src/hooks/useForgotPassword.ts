import { useState, useCallback } from 'react';
import { authApi } from '../services/AuthApi';

interface UseForgotPasswordState {
  loading: boolean;
  error: Error | null;
  sentTo: string | null;
}

export function useForgotPassword(): UseForgotPasswordState & { request: (email: string) => Promise<void> } {
  const [state, setState] = useState<UseForgotPasswordState>({ loading: false, error: null, sentTo: null });

  const request = useCallback(async (email: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { sentTo } = await authApi.requestPasswordReset(email);
      setState({ loading: false, error: null, sentTo });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ loading: false, error, sentTo: null });
    }
  }, []);

  return { ...state, request };
}
