import { useState, useCallback, useEffect } from 'react';
import { catalogApi, type Product } from '../services/CatalogApi';

interface UseCatalogState {
  loading: boolean;
  error: Error | null;
  products: Product[];
  categories: string[];
  category: string;
}

export function useCatalog(): UseCatalogState & { setCategory: (category: string) => void; refresh: () => Promise<void> } {
  const [state, setState] = useState<UseCatalogState>({
    loading: true,
    error: null,
    products: [],
    categories: [],
    category: 'All',
  });

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const [categories, products] = await Promise.all([catalogApi.categories(), catalogApi.list(state.category)]);
      setState(prev => ({ ...prev, loading: false, error: null, categories, products }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState(prev => ({ ...prev, loading: false, error, products: [] }));
    }
  }, [state.category]);

  const setCategory = useCallback((category: string) => {
    setState(prev => ({ ...prev, category }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, setCategory, refresh };
}
