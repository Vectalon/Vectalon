// TDD test suite for useLogin.

import { renderHook, act } from '@testing-library/react-native';
import { useLogin } from '../hooks/useLogin';

describe('useLogin', () => {
  it('starts in the default state', async () => {
    const { result } = await renderHook(() => useLogin());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('stores a session after a valid login', async () => {
    const { result } = await renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('demo@vectalon.in', 'password123');
    });
    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.user.email).toBe('demo@vectalon.in');
    expect(result.current.loading).toBe(false);
  });

  it('surfaces validation errors', async () => {
    const { result } = await renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('not-an-email', 'x');
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.session).toBeNull();
  });
});
