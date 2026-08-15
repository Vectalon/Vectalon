import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { Product } from '../services/CatalogApi';

export interface CartLine {
  product: Product;
  qty: number;
}

interface CartValue {
  lines: CartLine[];
  add: (product: Product) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: number;
  total: number;
}

/**
 * Shared cart store. Before this existed every screen called useCart() and
 * got its own fresh empty cart; now the provider mounted in App.tsx owns the
 * state, so catalog → cart → checkout → confirmation read the same lines.
 */
const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
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

  return <CartContext.Provider value={{ lines, add, remove, clear, count, total }}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
