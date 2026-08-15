// End-to-end integration: catalog → cart → checkout → orders service.
// Drives the real AppNavigator (not mocked screens), so the shared cart store,
// navigation params, and service calls are all exercised for real.

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator } from '../navigation/AppNavigator';
import { CartProvider } from '../hooks/useCart';
import { ordersApi } from '../services/OrdersApi';

async function renderApp() {
  return render(
    <CartProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </CartProvider>,
  );
}

describe('catalog → order flow (end-to-end)', () => {
  it('adds to cart, checks out through the orders service, and clears the shared cart', async () => {
    await renderApp();

    // Onboarding → Login
    await fireEvent.press(screen.getByLabelText('Continue'));

    // Login with valid credentials (any email + 6-char password succeeds)
    await waitFor(() => expect(screen.getByLabelText('you@company.dev')).toBeDefined());
    await fireEvent.changeText(screen.getByLabelText('you@company.dev'), 'ava@vectalon.dev');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'hunter2');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    // Home dashboard → catalog
    await waitFor(() => expect(screen.getByText('Signed in — cart has 0 items.')).toBeDefined());
    await fireEvent.press(screen.getByLabelText('Shop the catalog'));

    // Catalog: wait for the seeded products, add two
    await waitFor(() => expect(screen.getByText('Aurora Lamp')).toBeDefined());
    await fireEvent.press(screen.getByLabelText('Add Aurora Lamp to cart'));
    await fireEvent.press(screen.getByLabelText('Add Ember Mug to cart'));
    expect(screen.getByText('View cart (2)')).toBeDefined();
    await fireEvent.press(screen.getByLabelText('View cart (2)'));

    // Cart reads the same shared store the catalog wrote to
    await waitFor(() => expect(screen.getByText('Total: $78 (2 items)')).toBeDefined());
    await fireEvent.press(screen.getByLabelText('Checkout'));

    // Checkout → place the order through the orders service
    await fireEvent.changeText(screen.getByLabelText('Shipping address'), '1 Demo Way, Testville');
    await fireEvent.press(screen.getByLabelText('Place order'));

    const confirmation = await waitFor(() => screen.getByText(/Order o_\d+ confirmed for \$78\./));
    const orderId = String(confirmation.props.children).match(/o_\d+/)?.[0];
    expect(orderId).toBeDefined();

    // The orders service actually recorded the order with the right items
    const placed = (await ordersApi.list()).find(o => o.id === orderId);
    expect(placed).toBeDefined();
    expect(placed!.total).toBe(78);
    expect(placed!.status).toBe('placed');
    expect(placed!.items.map(i => i.productId)).toEqual(['p1', 'p4']);
    expect(placed!.items.map(i => i.qty)).toEqual([1, 1]);

    // Back to catalog — checkout cleared the shared cart for the whole app
    await fireEvent.press(screen.getByLabelText('Back to catalog'));
    await waitFor(() => expect(screen.getByText('View cart (0)')).toBeDefined());
  });
});
