const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startResourceGuard } = require('./resource-guard.cjs');
const healthy = () => ({ availableBytes: 8 * 1024 ** 3, source: 'os-free' });

for (const reason of ['memory-reserve', 'memory-metric-changed', 'deadline']) test(`resource guard retains ${reason}, aborts and escalates once`, t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let state = healthy(), stops = [], hardStops = 0;
  const guard = startResourceGuard(() => state, 10000, reason => stops.push(reason), () => hardStops++);
  assert.equal(guard.signal.aborted, false);
  if (reason === 'memory-reserve') state = { ...state, availableBytes: 1024 };
  if (reason === 'memory-metric-changed') state = { ...state, source: 'macos-pressure-estimate' };
  t.mock.timers.tick(reason === 'deadline' ? 10000 : 1000);
  assert.equal(guard.signal.aborted, true);
  assert.equal(guard.observation.stopReason, reason);
  assert.deepEqual(stops, [reason]);
  t.mock.timers.tick(5000);
  assert.equal(hardStops, 1);
  guard.dispose();
  t.mock.timers.tick(20000);
  assert.equal(hardStops, 1);
});

test('healthy disposal clears timers and retains samples', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const guard = startResourceGuard(healthy, 10000, () => assert.fail('unexpected abort'), () => assert.fail('unexpected forced stop'));
  guard.dispose();
  t.mock.timers.tick(20000);
  assert.equal(guard.signal.aborted, false);
  assert.equal(guard.observation.minimumSampledAvailableBudgetBytes, healthy().availableBytes);
});

test('invalid initial memory refuses before a native call and cleanup cancels escalation', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const guard = startResourceGuard(() => ({ ...healthy(), availableBytes: NaN }), 10000, () => {}, () => assert.fail('cleared escalation'));
  assert.equal(guard.signal.aborted, true);
  guard.dispose();
  t.mock.timers.tick(20000);
});
