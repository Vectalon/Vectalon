import { useState, useCallback, useEffect } from 'react';
import { notificationsApi, type AppNotification } from '../services/NotificationsApi';

interface UseNotificationsState {
  loading: boolean;
  error: Error | null;
  notifications: AppNotification[];
}

export function useNotifications(): UseNotificationsState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<UseNotificationsState>({ loading: true, error: null, notifications: [] });

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const notifications = await notificationsApi.list();
      setState({ loading: false, error: null, notifications });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ loading: false, error, notifications: [] });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
