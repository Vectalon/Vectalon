export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  status: 'placed' | 'shipped' | 'delivered';
  placedAt: string;
}

const SEED: Order[] = [
  {
    id: 'o_1042',
    items: [
      { productId: 'p1', name: 'Aurora Lamp', qty: 1, unitPrice: 49 },
      { productId: 'p4', name: 'Ember Mug', qty: 2, unitPrice: 29 },
    ],
    total: 107,
    status: 'delivered',
    placedAt: '2026-07-22T11:20:00Z',
  },
  {
    id: 'o_1043',
    items: [{ productId: 'p5', name: 'Drift Speaker', qty: 1, unitPrice: 129 }],
    total: 129,
    status: 'shipped',
    placedAt: '2026-08-09T16:45:00Z',
  },
];

export class OrdersApi {
  async list(): Promise<Order[]> {
    return SEED.map(o => ({ ...o, items: o.items.map(i => ({ ...i })) }));
  }

  async place(items: OrderItem[]): Promise<Order> {
    if (!items.length) throw new Error('Cart is empty');
    const total = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
    const order: Order = {
      id: `o_${1044 + SEED.length}`,
      items: items.map(i => ({ ...i })),
      total,
      status: 'placed',
      placedAt: new Date().toISOString(),
    };
    SEED.push(order);
    return order;
  }
}

export const ordersApi = new OrdersApi();
