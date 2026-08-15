/**
 * Root stack param list — every screen the demo app ships. Typed so a route
 * name typo fails the build, not a navigation at runtime.
 */
export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  Home: undefined;
  Catalog: undefined;
  Cart: undefined;
  Checkout: undefined;
  OrderConfirmation: { orderId: string; total: number };
  Orders: undefined;
  Profile: undefined;
  Settings: undefined;
  Notifications: undefined;
  Security: undefined;
  Billing: undefined;
  Activity: undefined;
  Support: undefined;
  Debug: undefined;
};
