import { act, renderHook } from '@testing-library/react-native';
import { useOrders } from '../hooks/useOrders';
import { ordersApi, type Order } from '../services/OrdersApi';

const order = (id: string): Order => ({ id, items: [], total: 7, status: 'placed', placedAt: '2026-10-25T00:00:00Z' });
function deferred() {
  let resolve!: (orders: Order[]) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Order[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => jest.restoreAllMocks());

it.each(['resolve', 'reject'] as const)('ignores older %s while newest request is pending', async outcome => {
  const initial = [order('initial_orders_control')];
  const list = jest.spyOn(ordersApi, 'list').mockResolvedValue(initial);
  const { result } = await renderHook(() => useOrders());
  const older = deferred();
  const newest = deferred();
  list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newest.promise);
  let oldDone!: Promise<void>;
  let newDone!: Promise<void>;
  await act(async () => { oldDone = result.current.refresh(); newDone = result.current.refresh(); });
  expect(result.current.loading).toBe(true);
  expect(result.current.orders).toEqual(initial);
  await act(async () => {
    if (outcome === 'resolve') older.resolve([order('older_orders_control')]);
    else older.reject(new Error('stale_failure_control'));
    await oldDone;
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBeNull();
  expect(result.current.orders).toEqual(initial);
  const latest = [order('latest_orders_control')];
  await act(async () => { newest.resolve(latest); await newDone; });
  expect(result.current).toMatchObject({ loading: false, error: null, orders: latest });
});

it.each(['resolve', 'reject'] as const)('ignores older %s after newest request succeeds', async outcome => {
  const older = deferred();
  const newest = deferred();
  jest.spyOn(ordersApi, 'list').mockReturnValueOnce(older.promise).mockReturnValueOnce(newest.promise);
  const { result } = await renderHook(() => useOrders());
  let newDone!: Promise<void>;
  await act(async () => { newDone = result.current.refresh(); });
  const latest = [order('latest_orders_control')];
  await act(async () => { newest.resolve(latest); await newDone; });
  await act(async () => {
    if (outcome === 'resolve') older.resolve([order('older_orders_control')]);
    else older.reject('stale_failure_control');
    await older.promise.catch(() => undefined);
  });
  expect(result.current).toMatchObject({ loading: false, error: null, orders: latest });
});

it('retains latest failure against stale success and can recover', async () => {
  const older = deferred();
  const newest = deferred();
  const list = jest.spyOn(ordersApi, 'list').mockReturnValueOnce(older.promise).mockReturnValueOnce(newest.promise);
  const { result } = await renderHook(() => useOrders());
  let newDone!: Promise<void>;
  await act(async () => { newDone = result.current.refresh(); });
  await act(async () => { newest.reject('latest_failure_control'); await newDone; });
  expect(result.current.loading).toBe(false);
  expect(result.current.error?.message).toBe('latest_failure_control');
  expect(result.current.orders).toEqual([]);
  await act(async () => { older.resolve([order('older_orders_control')]); await older.promise; });
  expect(result.current.error?.message).toBe('latest_failure_control');
  expect(result.current.orders).toEqual([]);
  const recovery = deferred();
  list.mockReturnValueOnce(recovery.promise);
  let done!: Promise<void>;
  await act(async () => { done = result.current.refresh(); });
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(true);
  const latest = [order('recovered_orders_control')];
  await act(async () => { recovery.resolve(latest); await done; });
  expect(result.current).toMatchObject({ loading: false, error: null, orders: latest });
});

it('does not share request ordering between mounted hook instances', async () => {
  const first = deferred();
  const second = deferred();
  jest.spyOn(ordersApi, 'list').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const a = await renderHook(() => useOrders());
  const b = await renderHook(() => useOrders());
  await act(async () => { second.resolve([order('second_instance_control')]); await second.promise; });
  await act(async () => { first.resolve([order('first_instance_control')]); await first.promise; });
  expect(a.result.current.orders[0].id).toBe('first_instance_control');
  expect(b.result.current.orders[0].id).toBe('second_instance_control');
});
