import React from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderConfirmation'>;

export function OrderConfirmationScreen({ navigation, route }: Props) {
  const { orderId, total } = route.params;
  return (
    <Screen title="Order placed">
      <Text style={styles.ok}>✓ Order {orderId} confirmed for ${total}.</Text>
      <Text style={styles.meta}>A confirmation email is on its way.</Text>
      <Button label="View orders" onPress={() => navigation.replace('Orders')} />
      <Button label="Back to catalog" variant="secondary" onPress={() => navigation.replace('Catalog')} />
    </Screen>
  );
}

const styles = StyleSheet.create({ ok: { fontSize: 17, fontWeight: '600', color: '#22c55e' }, meta: { fontSize: 14, color: '#6b7280', marginTop: 8, marginBottom: 16 } });
