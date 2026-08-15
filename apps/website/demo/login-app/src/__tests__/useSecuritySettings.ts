// TDD test suite for useSecuritySettings.

import { renderHook, act } from '@testing-library/react-native';
import { useSecuritySettings } from '../hooks/useSecuritySettings';

describe('useSecuritySettings', () => {
  it('defaults 2FA off and lists sessions', async () => {
    const { result } = await renderHook(() => useSecuritySettings());
    expect(result.current.twoFactorEnabled).toBe(false);
    expect(result.current.sessions.length).toBe(3);
  });

  it('toggles 2FA', async () => {
    const { result } = await renderHook(() => useSecuritySettings());
    await act(async () => result.current.toggleTwoFactor());
    expect(result.current.twoFactorEnabled).toBe(true);
  });

  it('revokes a session', async () => {
    const { result } = await renderHook(() => useSecuritySettings());
    await act(async () => result.current.revokeSession('s2'));
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions.some(s => s.id === 's2')).toBe(false);
  });
});
