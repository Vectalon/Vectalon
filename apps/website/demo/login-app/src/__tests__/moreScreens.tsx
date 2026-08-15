// Smoke tests for the remaining demo screens.

import React from 'react';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SignupScreen } from '../screens/SignupScreen';
import { CartProvider } from '../hooks/useCart';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SecurityScreen } from '../screens/SecurityScreen';
import { BillingScreen } from '../screens/BillingScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { CartScreen } from '../screens/CartScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { OrderConfirmationScreen } from '../screens/OrderConfirmationScreen';
import { DebugScreen } from '../screens/DebugScreen';

const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() } as never;

/** Cart-dependent screens need the shared store; wrap them in CartProvider. */
function renderWithCart(ui: ReactElement) {
  return render(<CartProvider>{ui}</CartProvider>);
}

describe('remaining demo screens', () => {
  it('SignupScreen renders', async () => {
    const { getByText } = await render(<SignupScreen navigation={navigation} route={{ key: 'Signup', name: 'Signup' } as never} />);
    expect(getByText('Create account')).toBeDefined();
  });

  it('ForgotPasswordScreen renders', async () => {
    const { getByText } = await render(<ForgotPasswordScreen navigation={navigation} route={{ key: 'ForgotPassword', name: 'ForgotPassword' } as never} />);
    expect(getByText('Reset password')).toBeDefined();
  });

  it('OnboardingScreen renders', async () => {
    const { getByText } = await render(<OnboardingScreen navigation={navigation} route={{ key: 'Onboarding', name: 'Onboarding' } as never} />);
    expect(getByText('Welcome')).toBeDefined();
  });

  it('HomeScreen renders dashboard links', async () => {
    const { getByText } = await renderWithCart(<HomeScreen navigation={navigation} route={{ key: 'Home', name: 'Home' } as never} />);
    expect(getByText('Shop the catalog')).toBeDefined();
    expect(getByText('Your orders')).toBeDefined();
  });

  it('ProfileScreen renders', async () => {
    const { getByText } = await render(<ProfileScreen navigation={navigation} route={{ key: 'Profile', name: 'Profile' } as never} />);
    expect(getByText('Profile')).toBeDefined();
  });

  it('SettingsScreen renders toggles', async () => {
    const { getByText } = await renderWithCart(<SettingsScreen navigation={navigation} route={{ key: 'Settings', name: 'Settings' } as never} />);
    expect(getByText('Dark mode')).toBeDefined();
    expect(getByText('Push notifications')).toBeDefined();
  });

  it('SecurityScreen renders', async () => {
    const { getByText } = await render(<SecurityScreen navigation={navigation} route={{ key: 'Security', name: 'Security' } as never} />);
    expect(getByText('Two-factor authentication')).toBeDefined();
    expect(getByText('Active sessions')).toBeDefined();
  });

  it('BillingScreen renders', async () => {
    const { getByText } = await render(<BillingScreen navigation={navigation} route={{ key: 'Billing', name: 'Billing' } as never} />);
    expect(getByText('Pro plan')).toBeDefined();
  });

  it('ActivityScreen renders', async () => {
    const { getByText } = await render(<ActivityScreen navigation={navigation} route={{ key: 'Activity', name: 'Activity' } as never} />);
    expect(getByText('Activity')).toBeDefined();
  });

  it('SupportScreen renders', async () => {
    const { getByText } = await render(<SupportScreen navigation={navigation} route={{ key: 'Support', name: 'Support' } as never} />);
    expect(getByText('Contact support')).toBeDefined();
  });

  it('CartScreen shows empty state', async () => {
    const { getByText } = await renderWithCart(<CartScreen navigation={navigation} route={{ key: 'Cart', name: 'Cart' } as never} />);
    expect(getByText('Your cart is empty.')).toBeDefined();
  });

  it('CheckoutScreen renders', async () => {
    const { getByText } = await renderWithCart(<CheckoutScreen navigation={navigation} route={{ key: 'Checkout', name: 'Checkout' } as never} />);
    expect(getByText('Checkout')).toBeDefined();
  });

  it('OrderConfirmationScreen renders the order id', async () => {
    const { getByText } = await render(
      <OrderConfirmationScreen
        navigation={navigation}
        route={{ key: 'OrderConfirmation', name: 'OrderConfirmation', params: { orderId: 'o_9999', total: 42 } } as never}
      />,
    );
    expect(getByText(/o_9999/)).toBeDefined();
  });

  it('DebugScreen keeps the golden screen reachable', async () => {
    const { getByText } = await render(<DebugScreen navigation={navigation} route={{ key: 'Debug', name: 'Debug' } as never} />);
    expect(getByText(/golden replay/)).toBeDefined();
  });
});
