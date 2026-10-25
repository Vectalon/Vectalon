const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const freeze = require('./one-app-evaluation-paired-repair-7b.json');

function taskDefinition(id, read) {
  assert.ok(freeze.tasks.includes(id), 'Unknown paired repair task');
  if (id === 'cart-membership') {
    const target = 'src/hooks/useCart.tsx';
    const original = read(target);
    const positiveControl = original
      .replace('  count: number;', '  count: number;\n  hasProduct: (productId: string) => boolean;')
      .replace('  const clear =', '  const hasProduct = useCallback((productId: string) => lines.some(line => line.product.id === productId), [lines]);\n\n  const clear =')
      .replace('value={{ lines, add, remove, clear, count, total }}', 'value={{ lines, add, remove, clear, count, total, hasProduct }}');
    assert.notEqual(positiveControl, original, 'Membership verifier control did not apply');
    return { id, kind: 'feature', target, fixturePaths: ['package.json', target, 'src/services/CatalogApi.ts'],
      prompt: 'Extend useCart with hasProduct(productId: string): boolean in its public API. It returns whether that product ID is currently in the shared cart, independent of quantity. Empty and unknown IDs return false. After React applies add/remove/clear updates, including batched operations, readers within the same provider must see the latest membership. Independent providers stay isolated. Preserve all existing operations, product metadata, count and total. Change only src/hooks/useCart.tsx and return its complete content.',
      positiveControl, acceptance: fs.readFileSync(path.join(__dirname, 'cart-membership.acceptance.tsx'), 'utf8') };
  }
  const proposalPath = 'src/services/OrdersApi.ts';
  const original = read(proposalPath);
  const proposal = original.replace('sum + i.qty * i.unitPrice', 'sum + i.unitPrice');
  assert.notEqual(proposal, original, 'Total review proposal did not apply');
  return { id, kind: 'review', target: 'src/__tests__/orderTotalReview.ts', proposalPath, proposal,
    fixturePaths: ['package.json', proposalPath],
    extraFixtures: { 'proposed.patch': 'Proposed change inside OrdersApi.place():\n- const total = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);\n+ const total = items.reduce((sum, i) => sum + i.unitPrice, 0);' },
    prompt: 'Review proposed.patch against OrdersApi.place. Produce one meaningful executable Jest regression test that passes on the original service and fails through an assertion on the proposed implementation if it regresses observable order behavior. Do not inspect source text, mock the service, use environment/process APIs, or edit implementation. Import only from ../services/OrdersApi and use normal Jest globals. Return only src/__tests__/orderTotalReview.ts with its complete test content.',
    positiveControl: "import { OrdersApi } from '../services/OrdersApi';\nit('includes item quantities in placed and stored totals', async () => {\n  const api = new OrdersApi();\n  const order = await api.place([{ productId: 'paired_repair_acceptance_canary', name: 'First', qty: 3, unitPrice: 8 }, { productId: 'second', name: 'Second', qty: 2, unitPrice: 5 }]);\n  expect(order.total).toBe(34);\n  expect((await api.list()).find(item => item.id === order.id)!.total).toBe(34);\n});\n",
    acceptance: '' };
}

module.exports = { freeze, taskDefinition };
