import { useState, useCallback, useMemo } from 'react';
import type { Product } from '../services/CatalogApi';

export interface CartLine {
  product: Product;
  qty: number;
}

export function useCart(): {
  lines: CartLine[];
  add: (product: Product) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: number;
  total: number;
} {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback((product: Product) => {
    setLines(prev => {
      const existing = prev.find(l => l.product.id === product.id);
      if (existing) {
        return prev.map(l => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { product, qty: 1 }];
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setLines(prev => prev.filter(l => l.product.id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const { count, total } = useMemo(
    () => ({
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      total: lines.reduce((sum, l) => sum + l.qty * l.product.price, 0),
    }),
    [lines],
  );

  return { lines, add, remove, clear, count, total };
}
