// Screen test for NotificationsScreen.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { NotificationsScreen } from '../screens/NotificationsScreen';

const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() } as never;

describe('NotificationsScreen', () => {
  it('renders seeded notifications', async () => {
    const { getByText } = await render(<NotificationsScreen navigation={navigation} route={{ key: 'Notifications', name: 'Notifications' } as never} />);
    await waitFor(() => expect(getByText('Welcome')).toBeDefined());
    expect(getByText('Security check')).toBeDefined();
  });
});
