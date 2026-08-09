// TDD test suite for AddGreetCommand — written before implementation.
// Run `npm test AddGreetCommand` to verify the implementation satisfies these requirements.

import React from 'react';
import { render } from '@testing-library/react-native';
import { AddGreetCommandScreen } from '../screens/AddGreetCommandScreen';

describe('AddGreetCommandScreen', () => {
  it('renders the AddGreetCommand title', async () => {
    const { getByText } = await render(<AddGreetCommandScreen />);
    expect(getByText('AddGreetCommand')).toBeDefined();
  });
});
