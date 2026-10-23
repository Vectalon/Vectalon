import { renderHook, act } from '@testing-library/react-native';
import { useSecuritySettings } from '../hooks/useSecuritySettings';

it('protects the current session through the public hook', async () => {
  const { result } = await renderHook(() => useSecuritySettings());
  const initial = result.current.sessions;
  const current = initial.find(session => session.current)!;
  await act(async () => { result.current.revokeSession(current.id); });
  expect(result.current.sessions).toEqual(initial);
  await act(async () => { result.current.revokeSession('unknown-session'); });
  expect(result.current.sessions).toEqual(initial);
});

it('preserves batched revocation and independent two-factor state', async () => {
  const { result } = await renderHook(() => useSecuritySettings());
  const initial = result.current.sessions;
  const others = initial.filter(session => !session.current);
  await act(async () => {
    result.current.revokeSession(others[0].id);
    result.current.revokeSession(others[0].id);
    result.current.revokeSession(others[1].id);
    result.current.toggleTwoFactor();
  });
  expect(result.current.sessions).toEqual(initial.filter(session => session.current));
  expect(result.current.twoFactorEnabled).toBe(true);
});
