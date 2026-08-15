import { useState, useCallback } from 'react';
import { authApi, type Session } from '../services/AuthApi';

interface UseLoginState {
  loading: boolean;
  error: Error | null;
  session: Session | null;
}

export function useLogin(): UseLoginState & { login: (email: string, password: string) => Promise<void> } {
  const [state, setState] = useState<UseLoginState>({ loading: false, error: null, session: null });

  const login = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const session = await authApi.login(email, password);
      setState({ loading: false, error: null, session });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ loading: false, error, session: null });
    }
  }, []);

  return { ...state, login };
}
