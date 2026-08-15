import { useState, useCallback } from 'react';
import { authApi, type Session } from '../services/AuthApi';

interface UseSignupState {
  loading: boolean;
  error: Error | null;
  session: Session | null;
}

export function useSignup(): UseSignupState & { signup: (name: string, email: string, password: string) => Promise<void> } {
  const [state, setState] = useState<UseSignupState>({ loading: false, error: null, session: null });

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const session = await authApi.signup(name, email, password);
      setState({ loading: false, error: null, session });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ loading: false, error, session: null });
    }
  }, []);

  return { ...state, signup };
}
