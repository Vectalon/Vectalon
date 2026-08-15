export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  inStock: boolean;
}

const CATALOG: Product[] = [
  { id: 'p1', name: 'Aurora Lamp', category: 'Lighting', price: 49, inStock: true },
  { id: 'p2', name: 'Haven Chair', category: 'Furniture', price: 219, inStock: true },
  { id: 'p3', name: 'Nimbus Desk', category: 'Furniture', price: 189, inStock: false },
  { id: 'p4', name: 'Ember Mug', category: 'Kitchen', price: 29, inStock: true },
  { id: 'p5', name: 'Drift Speaker', category: 'Audio', price: 129, inStock: true },
  { id: 'p6', name: 'Sable Backpack', category: 'Bags', price: 89, inStock: true },
];

export class CatalogApi {
  async list(category?: string): Promise<Product[]> {
    if (!category || category === 'All') return CATALOG.map(p => ({ ...p }));
    return CATALOG.filter(p => p.category === category).map(p => ({ ...p }));
  }

  async categories(): Promise<string[]> {
    return ['All', ...new Set(CATALOG.map(p => p.category))];
  }

  async get(id: string): Promise<Product | null> {
    return CATALOG.find(p => p.id === id) ?? null;
  }
}

export const catalogApi = new CatalogApi();
