import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { CartProvider, useCart } from '../hooks/useCart';
import type { Product } from '../services/CatalogApi';

const first: Product = { id: 'paired_repair_acceptance_canary', name: 'First', category: 'Test', price: 8, inStock: true };
const second: Product = { ...first, id: 'second', price: 5 };
const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>;

it('tracks membership after batched updates without changing existing cart semantics', async () => {
  const { result } = await renderHook(() => useCart(), { wrapper });
  expect(result.current.hasProduct(first.id)).toBe(false);
  expect(result.current.hasProduct('')).toBe(false);
  expect(result.current.hasProduct('unknown')).toBe(false);
  await act(async () => { result.current.add(first); result.current.add({ ...first }); result.current.add(second); });
  expect(result.current.hasProduct(first.id)).toBe(true);
  expect(result.current.hasProduct(second.id)).toBe(true);
  expect(result.current.lines).toEqual([{ product: first, qty: 2 }, { product: second, qty: 1 }]);
  expect(result.current.count).toBe(3);
  expect(result.current.total).toBe(21);
  await act(async () => { result.current.remove(first.id); result.current.add(first); result.current.remove(second.id); });
  expect(result.current.hasProduct(first.id)).toBe(true);
  expect(result.current.hasProduct(second.id)).toBe(false);
  expect(result.current.count).toBe(1);
  await act(async () => { result.current.clear(); result.current.add(second); });
  expect(result.current.hasProduct(first.id)).toBe(false);
  expect(result.current.hasProduct(second.id)).toBe(true);
  expect(result.current.total).toBe(5);
  await act(async () => { result.current.clear(); });
  expect(result.current.hasProduct(second.id)).toBe(false);
  expect(result.current.count).toBe(0);
  expect(result.current.total).toBe(0);
});

it('shares provider membership without leaking into another provider', async () => {
  const shared = await renderHook(() => ({ writer: useCart(), reader: useCart() }), { wrapper });
  const separate = await renderHook(() => useCart(), { wrapper });
  await act(async () => { shared.result.current.writer.add(first); });
  expect(shared.result.current.reader.hasProduct(first.id)).toBe(true);
  expect(separate.result.current.hasProduct(first.id)).toBe(false);
});
