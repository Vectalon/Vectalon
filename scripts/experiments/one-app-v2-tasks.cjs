const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const freeze = require('./one-app-evaluation-v2-7b.json');

function taskDefinition(id, read) {
  assert.ok(freeze.tasks.includes(id), 'Unknown v2 evaluation task');
  const task = { id, fixturePaths: ['package.json'] };
  if (id === 'cart-distinct-count') {
    task.kind = 'feature';
    task.target = 'src/hooks/useCart.tsx';
    task.fixturePaths.push(task.target, 'src/services/CatalogApi.ts');
    task.prompt = 'Extend useCart with distinctCount: number, the number of distinct product IDs currently in the shared cart, not the sum of quantities. It starts at zero and updates correctly after batched add/remove/clear operations. Preserve the existing public API, line/product metadata, quantities, count and total, shared provider state and isolation between providers. Change only src/hooks/useCart.tsx and return its complete content.';
    task.positiveControl = read(task.target)
      .replace('  count: number;', '  count: number;\n  distinctCount: number;')
      .replace('value={{ lines, add, remove, clear, count, total }}', 'value={{ lines, add, remove, clear, count, total, distinctCount: lines.length }}');
  } else if (id === 'catalog-get-isolation') {
    task.kind = 'fix';
    task.target = 'src/services/CatalogApi.ts';
    task.fixturePaths.push(task.target, 'src/hooks/useCatalog.ts');
    task.prompt = 'Fix CatalogApi.get so callers cannot change the catalog by mutating a returned product. Each successful get must return an independent product object with unchanged field values. Mutating it must not affect subsequent get/list results, categories, or other products. Preserve null for unknown IDs and existing list/category behavior and public API. Change only src/services/CatalogApi.ts and return its complete content.';
    task.positiveControl = read(task.target).replace('    return CATALOG.find(p => p.id === id) ?? null;',
      '    const product = CATALOG.find(p => p.id === id);\n    return product ? { ...product } : null;');
  } else {
    task.kind = 'review';
    task.target = 'src/__tests__/orderInputReview.ts';
    task.proposalPath = 'src/services/OrdersApi.ts';
    task.fixturePaths.push(task.proposalPath);
    task.proposal = read(task.proposalPath).replace('items: items.map(i => ({ ...i })),', 'items,');
    assert.notEqual(task.proposal, read(task.proposalPath), 'V2 proposed change did not apply');
    task.extraFixtures = { 'proposed.patch': 'Proposed change inside OrdersApi.place():\n- items: items.map(i => ({ ...i })),\n+ items,' };
    task.prompt = 'Review proposed.patch against OrdersApi.place. Produce one meaningful executable Jest regression test that passes on the original service and fails through an assertion on the proposed implementation if it regresses observable order behavior. Do not inspect source text, mock the service, use environment/process APIs, or edit implementation. Import only from ../services/OrdersApi and use normal Jest globals. Return only src/__tests__/orderInputReview.ts with its complete test content.';
    task.positiveControl = "import { OrdersApi } from '../services/OrdersApi';\nit('isolates placed orders from caller-owned items', async () => {\n  const api = new OrdersApi();\n  const items = [{ productId: 'v2_acceptance_canary', name: 'Test item', qty: 2, unitPrice: 7 }];\n  const order = await api.place(items);\n  items[0].qty = 99;\n  const stored = (await api.list()).find(item => item.id === order.id)!;\n  expect(stored.items[0].qty).toBe(2);\n  expect(stored.total).toBe(14);\n});\n";
  }
  if (task.kind !== 'review') assert.notEqual(task.positiveControl, read(task.target), 'V2 verifier control did not apply');
  task.acceptance = task.kind === 'review' ? '' : fs.readFileSync(path.join(__dirname, `${id}.acceptance.tsx`), 'utf8');
  return task;
}

module.exports = { freeze, taskDefinition };
