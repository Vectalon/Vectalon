const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const freeze = require('./one-app-evaluation.json');

function taskDefinition(id, read) {
  assert.ok(freeze.tasks.includes(id), 'Unknown frozen evaluation task');
  const task = { id, fixturePaths: ['package.json'], kind: id === 'stock-filter' ? 'feature' : id === 'current-session' ? 'fix' : 'review' };
  if (id === 'stock-filter') {
    task.target = 'src/screens/CatalogScreen.tsx';
    task.fixturePaths.push(task.target, 'src/hooks/useCatalog.ts', 'src/hooks/useCart.tsx', 'src/services/CatalogApi.ts', 'src/components/ui.tsx', 'src/navigation/types.ts');
    task.prompt = 'Add an in-stock filter to CatalogScreen. Provide a React Native Switch with accessibilityLabel "In stock only", initially off. When on, show only in-stock products in the selected category. Keep its state when category changes; turning it off restores all products in that category. Preserve loading/error/category navigation and shared cart actions. Change only src/screens/CatalogScreen.tsx and return its complete content.';
    task.positiveControl = read(task.target)
      .replace("import React from 'react';", "import React, { useState } from 'react';")
      .replace('ActivityIndicator, FlatList,', 'ActivityIndicator, Switch, FlatList,')
      .replace('  const { products,', '  const [inStockOnly, setInStockOnly] = useState(false);\n  const { products,')
      .replace('      <View style={styles.chips}>', '      <Switch accessibilityLabel="In stock only" value={inStockOnly} onValueChange={setInStockOnly} />\n      <View style={styles.chips}>')
      .replace('data={products}', 'data={inStockOnly ? products.filter(product => product.inStock) : products}');
  } else if (id === 'current-session') {
    task.target = 'src/hooks/useSecuritySettings.ts';
    task.fixturePaths.push(task.target, 'src/screens/SecurityScreen.tsx');
    task.prompt = 'Fix useSecuritySettings so revokeSession cannot remove the current session even when called directly through the hook. Unknown or repeated IDs must be harmless. Preserve non-current-session revocation, batched updates, session metadata and the independent two-factor toggle. Keep the existing public API. Change only src/hooks/useSecuritySettings.ts and return its complete content.';
    task.positiveControl = read(task.target).replace('s => s.id !== id', 's => s.current || s.id !== id');
  } else {
    task.target = 'src/__tests__/orderCopyReview.ts';
    task.proposalPath = 'src/services/OrdersApi.ts';
    task.fixturePaths.push(task.proposalPath);
    const original = read(task.proposalPath);
    task.proposal = original.replace('items: o.items.map(i => ({ ...i }))', 'items: o.items');
    assert.notEqual(task.proposal, original, 'Proposed review change did not apply');
    task.extraFixtures = { 'proposed.patch': 'Proposed change to OrdersApi.list():\n- return SEED.map(o => ({ ...o, items: o.items.map(i => ({ ...i })) }));\n+ return SEED.map(o => ({ ...o, items: o.items }));' };
    task.prompt = 'Review the proposed.patch change to OrdersApi.list against the supplied original service. Produce one meaningful executable Jest regression test that passes on the original service and fails on the proposed change if it causes a regression. Test observable service behavior; do not inspect source text, mock the service, use environment/process APIs, or edit implementation. Import only from ../services/OrdersApi; use normal Jest globals. Return only src/__tests__/orderCopyReview.ts with its complete test content.';
    task.positiveControl = "import { OrdersApi } from '../services/OrdersApi';\nit('keeps returned order items isolated between reads', async () => {\n  const api = new OrdersApi();\n  const first = await api.list();\n  const original = first[0].items[0].qty;\n  first[0].items[0].qty = original + 10;\n  const second = await api.list();\n  expect(second[0].items[0].qty).toBe(original);\n});\n";
  }
  task.acceptance = task.kind === 'review' ? '' : fs.readFileSync(path.join(__dirname, `${id}.acceptance.tsx`), 'utf8');
  return task;
}

function reviewImportsAllowed(content, ts) {
  const file = ts.createSourceFile('review.ts', content, ts.ScriptTarget.Latest, true);
  let allowed = file.parseDiagnostics.length === 0;
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text !== '../services/OrdersApi') allowed = false;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ['require', 'eval', 'Function'].includes(node.expression.getText(file)))) allowed = false;
    if (ts.isIdentifier(node) && ['process', 'globalThis', 'global', 'jest', 'require', 'eval', 'Function'].includes(node.text)) allowed = false;
    ts.forEachChild(node, visit);
  }
  visit(file);
  return allowed;
}

module.exports = { freeze, taskDefinition, reviewImportsAllowed };
