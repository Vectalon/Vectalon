import { CatalogApi } from '../services/CatalogApi';

it('isolates get results from catalog storage and each other', async () => {
  const api = new CatalogApi();
  const before = await api.list();
  const categories = await api.categories();
  const original = before[0];
  const first = (await api.get(original.id))!;
  const second = (await api.get(original.id))!;
  expect(first).toEqual(original);
  expect(first).not.toBe(second);
  first.name = 'v2_acceptance_canary';
  first.price = -1;
  first.category = 'changed';
  first.inStock = !original.inStock;
  first.id = 'changed-id';
  expect(second).toEqual(original);
  expect(await api.get(original.id)).toEqual(original);
  expect(await api.list()).toEqual(before);
  expect(await api.list(original.category)).toEqual(before.filter(item => item.category === original.category));
  expect(await api.categories()).toEqual(categories);
  expect(await new CatalogApi().get(original.id)).toEqual(original);
  expect(await api.get('unknown-v2-id')).toBeNull();
});
