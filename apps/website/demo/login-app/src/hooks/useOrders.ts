import { useState, useCallback, useEffect } from 'react';
import { ordersApi, type Order } from '../services/OrdersApi';

interface UseOrdersState {
  loading: boolean;
  error: Error | null;
  orders: Order[];
}

export function useOrders(): UseOrdersState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<UseOrdersState>({ loading: true, error: null, orders: [] });

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const orders = await ordersApi.list();
      setState({ loading: false, error: null, orders });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ loading: false, error, orders: [] });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
