// Screen test for OrdersScreen.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { OrdersScreen } from '../screens/OrdersScreen';

const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() } as never;

describe('OrdersScreen', () => {
  it('renders seeded orders', async () => {
    const { getByText } = await render(<OrdersScreen navigation={navigation} route={{ key: 'Orders', name: 'Orders' } as never} />);
    await waitFor(() => expect(getByText('o_1042')).toBeDefined());
    expect(getByText('o_1043')).toBeDefined();
  });
});
