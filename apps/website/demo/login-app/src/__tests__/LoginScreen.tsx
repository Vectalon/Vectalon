// Screen test for LoginScreen.

import React from 'react';
import { render } from '@testing-library/react-native';
import { LoginScreen } from '../screens/LoginScreen';

const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() } as never;

describe('LoginScreen', () => {
  it('renders the sign-in form', async () => {
    const { getAllByText, getByText, getByPlaceholderText } = await render(<LoginScreen navigation={navigation} route={{ key: 'Login', name: 'Login' } as never} />);
    expect(getAllByText('Sign in').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Create account')).toBeDefined();
    expect(getByText('Forgot password?')).toBeDefined();
    expect(getByPlaceholderText('you@company.dev')).toBeDefined();
    expect(getByPlaceholderText('Password')).toBeDefined();
  });
});
