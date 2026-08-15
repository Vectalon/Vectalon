// TDD test suite for useCart.

import { renderHook, act } from '@testing-library/react-native';
import { useCart } from '../hooks/useCart';
import type { Product } from '../services/CatalogApi';

const P: Product = { id: 'p1', name: 'Aurora Lamp', category: 'Lighting', price: 49, inStock: true };

describe('useCart', () => {
  it('starts empty', async () => {
    const { result } = await renderHook(() => useCart());
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it('adds a product and accumulates quantity', async () => {
    const { result } = await renderHook(() => useCart());
    await act(async () => {
      result.current.add(P);
      result.current.add(P);
    });
    expect(result.current.count).toBe(2);
    expect(result.current.total).toBe(98);
  });

  it('removes a line and clears', async () => {
    const { result } = await renderHook(() => useCart());
    await act(async () => {
      result.current.add(P);
      result.current.remove('p1');
    });
    expect(result.current.count).toBe(0);
    await act(async () => {
      result.current.add(P);
      result.current.clear();
    });
    expect(result.current.total).toBe(0);
  });
});
