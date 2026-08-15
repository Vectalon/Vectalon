import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCatalog } from '../hooks/useCatalog';
import { useCart } from '../hooks/useCart';
import { Screen, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Catalog'>;

export function CatalogScreen({ navigation }: Props) {
  const { products, categories, category, setCategory, loading, error } = useCatalog();
  const { add, count } = useCart();

  if (loading) {
    return (
      <Screen title="Catalog">
        <ActivityIndicator style={styles.center} />
      </Screen>
    );
  }

  return (
    <Screen title="Catalog">
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      <View style={styles.chips}>
        {categories.map(c => (
          <Pressable
            key={c}
            style={[styles.chip, c === category && styles.chipActive]}
            onPress={() => setCategory(c)}
            accessibilityRole="button"
          >
            <Text style={c === category ? styles.chipTextActive : styles.chipText}>{c}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={products}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{item.category} · ${item.price}</Text>
              {!item.inStock && <Text style={styles.out}>out of stock</Text>}
            </View>
            <Pressable
              style={[styles.add, !item.inStock && styles.addDisabled]}
              onPress={() => item.inStock && add(item)}
              disabled={!item.inStock}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.name} to cart`}
            >
              <Text style={styles.addText}>+</Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={styles.list}
      />
      <Button label={`View cart (${count})`} onPress={() => navigation.navigate('Cart')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: 40 },
  error: { color: '#ff3b30', marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#d1d5db' },
  chipActive: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
  chipText: { color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { gap: 10, paddingBottom: 14 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 14 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  out: { fontSize: 12, color: '#ff3b30', marginTop: 2 },
  add: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a84ff', alignItems: 'center', justifyContent: 'center' },
  addDisabled: { backgroundColor: '#d1d5db' },
  addText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
