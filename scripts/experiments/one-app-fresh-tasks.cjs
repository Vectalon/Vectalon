const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const freeze = require('./one-app-evaluation-fresh-7b.json');

function taskDefinition(id, read) {
  assert.ok(freeze.tasks.includes(id), 'Unknown fresh evaluation task');
  const target = 'src/hooks/useOrders.ts';
  const original = read(target);
  const positiveControl = original
    .replace('useEffect }', 'useEffect, useRef }')
    .replace('  const refresh =', '  const requestSequence = useRef(0);\n  const refresh =')
    .replace('    setState(prev =>', '    const requestId = ++requestSequence.current;\n    setState(prev =>')
    .replace('      setState({ loading: false, error: null, orders });', '      if (requestId !== requestSequence.current) return;\n      setState({ loading: false, error: null, orders });')
    .replace('    } catch (err) {', '    } catch (err) {\n      if (requestId !== requestSequence.current) return;');
  assert.notEqual(positiveControl, original, 'Fresh verifier control did not apply');
  return {
    id, kind: 'fix', target,
    fixturePaths: ['package.json', target, 'src/services/OrdersApi.ts', 'src/screens/OrdersScreen.tsx'],
    prompt: 'Fix overlapping refresh requests in useOrders. Only the most recently started refresh may publish orders, errors or completion/loading state; an older response or rejection must not overwrite it, whether it arrives before or after the newest request settles. Keep existing orders while the newest request loads, clear the previous error when refresh starts, and preserve the existing failure behavior for the newest request. Preserve automatic initial loading, the public API, metadata and independent hook instances. Change only src/hooks/useOrders.ts and return its complete content.',
    positiveControl,
    acceptance: fs.readFileSync(path.join(__dirname, 'orders-refresh-race.acceptance.tsx'), 'utf8'),
  };
}

module.exports = { freeze, taskDefinition };
