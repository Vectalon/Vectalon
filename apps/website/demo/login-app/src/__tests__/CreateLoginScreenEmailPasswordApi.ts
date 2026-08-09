// TDD test suite for CreateLoginScreenEmailPasswordApi — written before implementation.

import { createLoginScreenEmailPasswordApi } from '../services/CreateLoginScreenEmailPasswordApi';

describe('CreateLoginScreenEmailPasswordApi', () => {
  it('executes and returns a result', async () => {
    const result = await createLoginScreenEmailPasswordApi.execute('a@b.com', 'secret');
    expect(result).toBe('ok');
  });
});
