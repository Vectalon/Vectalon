import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useOrders } from '../hooks/useOrders';
import { Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

export function OrdersScreen(_props: Props) {
  const { orders, loading, error } = useOrders();

  if (loading) {
    return (
      <Screen title="Orders">
        <ActivityIndicator style={styles.center} />
      </Screen>
    );
  }

  return (
    <Screen title="Orders">
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      <FlatList
        data={orders}
        keyExtractor={o => o.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{item.id}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
            <Text style={styles.cardMeta}>
              {item.items.length} line(s) · ${item.total} · {item.placedAt.slice(0, 10)}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: 40 },
  error: { color: '#ff3b30', marginBottom: 12 },
  list: { gap: 10 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 14 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 13, color: '#0a84ff', textTransform: 'capitalize' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});
