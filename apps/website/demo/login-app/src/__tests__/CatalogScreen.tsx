// Screen test for CatalogScreen.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { CatalogScreen } from '../screens/CatalogScreen';

const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() } as never;

describe('CatalogScreen', () => {
  it('renders the catalog with seeded products', async () => {
    const { getByText } = await render(<CatalogScreen navigation={navigation} route={{ key: 'Catalog', name: 'Catalog' } as never} />);
    await waitFor(() => expect(getByText('Aurora Lamp')).toBeDefined());
    expect(getByText('Drift Speaker')).toBeDefined();
    expect(getByText('View cart (0)')).toBeDefined();
  });
});
