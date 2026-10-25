// Public development control; never a held-out improvement result.
const original = `import { useState, useCallback, useEffect } from 'react';
export function useDelayedLabel(load: () => Promise<string>) {
  const [label, setLabel] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const next = await load();
      setLabel(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
    }
  }, [load]);
  useEffect(() => { void reload(); }, [reload]);
  return { label, pending, error, reload };
}
`;

module.exports = {
  id: 'delayed-label-v1', kind: 'development-control', target: 'src/hooks/useDelayedLabel.ts',
  prompt: 'Fix useDelayedLabel so only the most recently started reload can publish label, error or pending completion. Preserve the previous label during loading and failures, clear the error on reload, automatically load on mount or when the load function changes, and do not introduce an effect reload loop. Keep hook instances independent and preserve the existing API. Change only src/hooks/useDelayedLabel.ts and return its complete content.',
  original,
  positiveControl: original
    .replace('useEffect }', 'useEffect, useRef }')
    .replace('  const reload =', '  const sequence = useRef(0);\n  const reload =')
    .replace('    setPending(true);', '    const current = ++sequence.current;\n    setPending(true);')
    .replace('      setLabel(next);', '      if (current === sequence.current) setLabel(next);')
    .replace('      setError(failure', '      if (current === sequence.current) setError(failure')
    .replace('      setPending(false);', '      if (current === sequence.current) setPending(false);'),
  acceptance: `import { act, renderHook } from '@testing-library/react-native';
import { useDelayedLabel } from '../hooks/useDelayedLabel';
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
it.each(['resolve', 'reject'] as const)('ignores stale %s while newest label is pending', async outcome => {
  const load = jest.fn().mockResolvedValue('label_control_initial');
  const { result } = await renderHook(() => useDelayedLabel(load));
  expect(result.current.label).toBe('label_control_initial');
  expect(load).toHaveBeenCalledTimes(1);
  const older = deferred();
  const newer = deferred();
  load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const retained = result.current.reload;
  let a!: Promise<void>;
  let b!: Promise<void>;
  await act(async () => { a = retained(); b = result.current.reload(); });
  expect(result.current.label).toBe('label_control_initial');
  expect(result.current.pending).toBe(true);
  await act(async () => {
    if (outcome === 'resolve') older.resolve('label_control_obsolete');
    else older.reject('label_control_stale_error');
    await a;
  });
  expect(result.current).toMatchObject({ label: 'label_control_initial', pending: true, error: null });
  await act(async () => { newer.resolve('label_control_new'); await b; });
  expect(result.current).toMatchObject({ label: 'label_control_new', pending: false, error: null });
  expect(load).toHaveBeenCalledTimes(3);
});
it.each(['resolve', 'reject'] as const)('preserves newest failure after stale %s, then recovers', async outcome => {
  const load = jest.fn().mockResolvedValue('label_control_initial');
  const { result } = await renderHook(() => useDelayedLabel(load));
  const older = deferred();
  const newer = deferred();
  load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  let a!: Promise<void>;
  let b!: Promise<void>;
  await act(async () => { a = result.current.reload(); b = result.current.reload(); });
  await act(async () => { newer.reject(new Error('label_control_latest_error')); await b; });
  await act(async () => {
    if (outcome === 'resolve') older.resolve('label_control_obsolete');
    else older.reject('label_control_stale_error');
    await a;
  });
  expect(result.current).toMatchObject({ label: 'label_control_initial', pending: false, error: 'label_control_latest_error' });
  await act(async () => { await result.current.reload(); });
  expect(result.current).toMatchObject({ label: 'label_control_initial', pending: false, error: null });
});
it('loads a changed function without sharing bookkeeping between instances', async () => {
  const first = deferred();
  const replacement = deferred();
  const independent = deferred();
  const initialLoad = () => first.promise;
  const nextLoad = () => replacement.promise;
  const otherLoad = () => independent.promise;
  const a = await renderHook(({ load }: { load: () => Promise<string> }) => useDelayedLabel(load), { initialProps: { load: initialLoad } });
  const b = await renderHook(() => useDelayedLabel(otherLoad));
  await a.rerender({ load: nextLoad });
  await act(async () => { replacement.resolve('label_control_replaced'); await replacement.promise; });
  await act(async () => { first.resolve('label_control_obsolete'); independent.resolve('label_control_other'); await Promise.all([first.promise, independent.promise]); });
  expect(a.result.current.label).toBe('label_control_replaced');
  expect(b.result.current.label).toBe('label_control_other');
});`,
};
