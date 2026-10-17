import { renderHook, act } from '@testing-library/react-native';
import { CartProvider, useCart } from '../hooks/useCart';
import type { Product } from '../services/CatalogApi';

const product: Product = { id: 'pilot-item', name: 'Pilot item', category: 'Test', price: 49, inStock: true };

it('sets an existing quantity and updates totals without changing product identity', async () => {
  const { result } = await renderHook(() => useCart(), { wrapper: CartProvider });
  await act(async () => { result.current.add(product); result.current.setQuantity(product.id, 3); });
  expect(result.current.lines).toEqual([{ product, qty: 3 }]);
  expect(result.current.count).toBe(3);
  expect(result.current.total).toBe(147);
});

it('ignores unknown items and invalid quantities without throwing', async () => {
  const { result } = await renderHook(() => useCart(), { wrapper: CartProvider });
  await act(async () => { result.current.add(product); });
  for (const qty of [-1, 1.5, NaN, Infinity, -Infinity]) {
    await act(async () => { result.current.setQuantity(product.id, qty); });
    expect(result.current.lines).toEqual([{ product, qty: 1 }]);
  }
  await act(async () => { result.current.setQuantity('unknown', 4); });
  expect(result.current.count).toBe(1);
  expect(result.current.total).toBe(49);
});

it('removes at zero and preserves existing add/remove/clear operations', async () => {
  const { result } = await renderHook(() => useCart(), { wrapper: CartProvider });
  await act(async () => { result.current.add(product); result.current.setQuantity(product.id, 0); });
  expect(result.current.lines).toEqual([]);
  expect(result.current.count).toBe(0);
  expect(result.current.total).toBe(0);
  await act(async () => { result.current.add(product); result.current.add(product); });
  expect(result.current.count).toBe(2);
  await act(async () => { result.current.remove(product.id); });
  expect(result.current.count).toBe(0);
  await act(async () => { result.current.add(product); result.current.clear(); });
  expect(result.current.lines).toEqual([]);
});
