// TDD test suite for useOrders.

import { renderHook, waitFor } from '@testing-library/react-native';
import { useOrders } from '../hooks/useOrders';

describe('useOrders', () => {
  it('loads the seeded orders', async () => {
    const { result } = await renderHook(() => useOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orders.length).toBeGreaterThan(0);
    expect(result.current.orders[0]).toHaveProperty('id');
    expect(result.current.error).toBeNull();
  });
});
