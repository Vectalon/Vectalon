// Public development controls, not held-out qualification tasks.
const ids = ['page-bound', 'batched-counter', 'batched-counter-stress-v1'];
function controlTask(id) {
  if (id === 'batched-counter-stress-v1') {
    const base = controlTask('batched-counter');
    return { ...base, id,
      prompt: base.prompt + ' Increment callbacks retained from earlier renders must remain correct after other callbacks update the state, including mixed old/new callbacks in one batch.',
      original: base.original.replace('const increment = () => setCount(count + 1);',
        'let queued = 0;\n  const increment = () => { queued += 1; setCount(count + queued); };'),
      priorAcceptance: base.acceptance,
      acceptance: base.acceptance + `
it('retained callbacks stay correct after later renders and updates', async () => {
  const { result } = await renderHook(() => useStepCounter());
  const retained = result.current.increment;
  await act(async () => { for (let i = 0; i < 4; i++) retained(); });
  expect(result.current.count).toBe(4);
  await act(async () => { result.current.increment(); });
  expect(result.current.count).toBe(5);
  await act(async () => { retained(); retained(); });
  expect(result.current.count).toBe(7);
});
it('composes callbacks from different renders in a single batch', async () => {
  const { result } = await renderHook(() => useStepCounter());
  const first = result.current.increment;
  await act(async () => { first(); first(); });
  const second = result.current.increment;
  await act(async () => { first(); second(); first(); });
  expect(result.current.count).toBe(5);
});`,
    };
  }
  if (id === 'page-bound') return {
    id, kind: 'development-control', target: 'src/services/PageBound.ts',
    prompt: 'Implement normalizePage(value: number): number. Non-finite values and values below 1 return 1. Otherwise round down and cap the result at 50. Preserve the existing PAGE_LABEL export. Change only src/services/PageBound.ts; return its complete content.',
    original: "export const PAGE_LABEL = 'Page';\nexport function normalizePage(value: number): number {\n  return 1;\n}\n",
    positiveControl: "export const PAGE_LABEL = 'Page';\nexport function normalizePage(value: number): number {\n  return Number.isFinite(value) && value >= 1 ? Math.min(50, Math.floor(value)) : 1;\n}\n",
    acceptance: `import { PAGE_LABEL, normalizePage } from '../services/PageBound';
it('bounds and rounds pages without changing the label', () => {
  expect(PAGE_LABEL).toBe('Page');
  for (const [value, expected] of [[NaN, 1], [Infinity, 1], [-Infinity, 1], [-4, 1], [0, 1], [0.9, 1], [1, 1], [2.9, 2], [49.9, 49], [50, 50], [90, 50]]) {
    expect(normalizePage(value)).toBe(expected);
  }
});`,
  };
  if (id === 'batched-counter') return {
    id, kind: 'development-control', target: 'src/hooks/useStepCounter.ts',
    prompt: 'Fix useStepCounter so every increment call adds one, including multiple calls in one React batch and calls after rerenders. Keep initial count zero, independent hook instances and the existing { count, increment } API. Change only src/hooks/useStepCounter.ts; return its complete content.',
    original: "import { useState } from 'react';\nexport function useStepCounter() {\n  const [count, setCount] = useState(0);\n  const increment = () => setCount(count + 1);\n  return { count, increment };\n}\n",
    positiveControl: "import { useState } from 'react';\nexport function useStepCounter() {\n  const [count, setCount] = useState(0);\n  const increment = () => setCount(value => value + 1);\n  return { count, increment };\n}\n",
    acceptance: `import { act, renderHook } from '@testing-library/react-native';
import { useStepCounter } from '../hooks/useStepCounter';
it('counts every batched call and continues after rerenders', async () => {
  const { result } = await renderHook(() => useStepCounter());
  expect(result.current.count).toBe(0);
  await act(async () => { for (let i = 0; i < 3; i++) result.current.increment(); });
  expect(result.current.count).toBe(3);
  await act(async () => { result.current.increment(); result.current.increment(); });
  expect(result.current.count).toBe(5);
});
it('does not share state across hook instances', async () => {
  const first = await renderHook(() => useStepCounter());
  const second = await renderHook(() => useStepCounter());
  await act(async () => { first.result.current.increment(); });
  expect(first.result.current.count).toBe(1);
  expect(second.result.current.count).toBe(0);
});`,
  };
  throw new Error('Unknown generation control');
}
module.exports = { ids, controlTask };
