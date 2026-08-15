import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCart } from '../hooks/useCart';
import { Screen, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

export function CartScreen({ navigation }: Props) {
  const { lines, remove, clear, total, count } = useCart();

  if (!lines.length) {
    return (
      <Screen title="Cart">
        <Text style={styles.empty}>Your cart is empty.</Text>
        <Button label="Back to catalog" variant="secondary" onPress={() => navigation.navigate('Catalog')} />
      </Screen>
    );
  }

  return (
    <Screen title="Cart">
      <FlatList
        data={lines}
        keyExtractor={l => l.product.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.product.name}</Text>
            <Text style={styles.cardMeta}>
              {item.qty} × ${item.product.price}
            </Text>
            <Button label="Remove" variant="danger" onPress={() => remove(item.product.id)} />
          </View>
        )}
        contentContainerStyle={styles.list}
      />
      <Text style={styles.total}>Total: ${total} ({count} items)</Text>
      <Button label="Checkout" onPress={() => navigation.navigate('Checkout')} />
      <Button label="Clear cart" variant="secondary" onPress={clear} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 15, color: '#6b7280', marginBottom: 16 },
  list: { gap: 10, paddingBottom: 14 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2, marginBottom: 8 },
  total: { fontSize: 17, fontWeight: '700', marginVertical: 14 },
});
