import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { CartProvider, useCart } from '../hooks/useCart';
import type { Product } from '../services/CatalogApi';

const product: Product = { id: 'v2_acceptance_canary', name: 'Fixture', price: 7, category: 'Test', inStock: true };
const other: Product = { ...product, id: 'second', price: 11 };
const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>;

it('counts distinct IDs without changing quantities, totals or product metadata', async () => {
  const { result } = await renderHook(() => useCart(), { wrapper });
  expect(result.current.distinctCount).toBe(0);
  await act(async () => { result.current.add(product); result.current.add({ ...product }); result.current.add(other); });
  expect(result.current.distinctCount).toBe(2);
  expect(result.current.count).toBe(3);
  expect(result.current.total).toBe(25);
  expect(result.current.lines).toEqual([{ product, qty: 2 }, { product: other, qty: 1 }]);
  await act(async () => { result.current.remove('unknown'); });
  expect(result.current.distinctCount).toBe(2);
  await act(async () => { result.current.remove(product.id); result.current.add(product); result.current.remove(other.id); });
  expect(result.current.distinctCount).toBe(1);
  expect(result.current.count).toBe(1);
  expect(result.current.total).toBe(7);
  await act(async () => { result.current.clear(); result.current.add(other); });
  expect(result.current.distinctCount).toBe(1);
  expect(result.current.total).toBe(11);
  await act(async () => { result.current.clear(); });
  expect(result.current.distinctCount).toBe(0);
  expect(result.current.count).toBe(0);
  expect(result.current.total).toBe(0);
});

it('shares counts within a provider without leaking state to another provider', async () => {
  const shared = await renderHook(() => ({ first: useCart(), second: useCart() }), { wrapper });
  const separate = await renderHook(() => useCart(), { wrapper });
  await act(async () => { shared.result.current.first.add(product); });
  expect(shared.result.current.second.distinctCount).toBe(1);
  expect(separate.result.current.distinctCount).toBe(0);
});
