import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { CatalogScreen } from '../screens/CatalogScreen';
import { CartProvider } from '../hooks/useCart';

it('filters stock without losing category selection or shared cart actions', async () => {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() } as never;
  await render(<CartProvider><CatalogScreen navigation={navigation} route={{ key: 'Catalog', name: 'Catalog' } as never} /></CartProvider>);
  await waitFor(() => expect(screen.getByText('Nimbus Desk')).toBeDefined());
  expect(screen.getByLabelText('In stock only').props.value).toBe(false);
  await fireEvent(screen.getByLabelText('In stock only'), 'valueChange', true);
  expect(screen.queryByText('Nimbus Desk')).toBeNull();
  expect(screen.getByText('Aurora Lamp')).toBeDefined();
  await fireEvent.press(screen.getByText('Furniture'));
  await waitFor(() => expect(screen.getByText('Haven Chair')).toBeDefined());
  expect(screen.queryByText('Aurora Lamp')).toBeNull();
  expect(screen.queryByText('Nimbus Desk')).toBeNull();
  expect(screen.getByLabelText('In stock only').props.value).toBe(true);
  await fireEvent.press(screen.getByLabelText('Add Haven Chair to cart'));
  expect(screen.getByText('View cart (1)')).toBeDefined();
  await fireEvent(screen.getByLabelText('In stock only'), 'valueChange', false);
  expect(screen.getByText('Nimbus Desk')).toBeDefined();
  expect(screen.queryByText('Aurora Lamp')).toBeNull();
  expect(screen.getByText('View cart (1)')).toBeDefined();
});
