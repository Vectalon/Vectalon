import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCart } from '../hooks/useCart';
import { ordersApi } from '../services/OrdersApi';
import { Screen, TextField, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

export function CheckoutScreen({ navigation }: Props) {
  const { lines, clear, total } = useCart();
  const [address, setAddress] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    try {
      const order = await ordersApi.place(lines.map(l => ({ productId: l.product.id, name: l.product.name, qty: l.qty, unitPrice: l.product.price })));
      clear();
      navigation.replace('OrderConfirmation', { orderId: order.id, total: order.total });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setPlacing(false);
    }
  }

  return (
    <Screen title="Checkout">
      <Text style={styles.total}>Total: ${total}</Text>
      <TextField value={address} onChangeText={setAddress} placeholder="Shipping address" autoCapitalize="words" />
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      <Button label="Place order" onPress={() => void placeOrder()} loading={placing} />
    </Screen>
  );
}

const styles = StyleSheet.create({ total: { fontSize: 17, fontWeight: '700', marginBottom: 12 }, error: { color: '#ff3b30', marginTop: 12 } });
