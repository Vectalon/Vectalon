// TDD test suite for useAddGreetCommand — written before implementation.

import { renderHook, act } from '@testing-library/react-native';
import { useAddGreetCommand } from '../hooks/useAddGreetCommand';

describe('useAddGreetCommand', () => {
  it('starts in the default state', async () => {
    const { result } = await renderHook(() => useAddGreetCommand());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('stores the result after running', async () => {
    const { result } = await renderHook(() => useAddGreetCommand());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe('ok');
    expect(result.current.loading).toBe(false);
  });
});
