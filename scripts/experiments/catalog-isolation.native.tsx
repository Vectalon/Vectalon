import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CatalogApi } from './src/services/CatalogApi';

export default function App() {
  const [lines, setLines] = useState(['Isolation: not run']);
  const [busy, setBusy] = useState(false);
  async function checkIsolation() {
    setBusy(true);
    try {
      const api = new CatalogApi();
      const before = await api.list();
      const categories = await api.categories();
      const original = before[0];
      const first = (await api.get(original.id))!;
      const second = (await api.get(original.id))!;
      const independent = first !== second;
      first.name = 'Changed by caller'; first.price = -1; first.category = 'Changed';
      first.inStock = !original.inStock; first.id = 'changed-id';
      const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const checks: [string, boolean][] = [
        ['Independent objects', independent],
        ['Second result unchanged', equal(second, original)],
        ['Next get unchanged', equal(await api.get(original.id), original)],
        ['Catalog list unchanged', equal(await api.list(), before)],
        ['Category list unchanged', equal(await api.categories(), categories)],
        ['Unknown ID returns null', (await api.get('unknown-native-id')) === null],
      ];
      setLines([`Isolation: ${checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL'}`,
        ...checks.map(([name, ok]) => `${name}: ${ok ? 'PASS' : 'FAIL'}`)]);
    } catch { setLines(['Isolation: ERROR']); }
    finally { setBusy(false); }
  }
  return <View style={styles.screen}>
    <Text style={styles.title}>Catalog isolation probe</Text>
    {lines.map(line => <Text key={line} style={styles.text}>{line}</Text>)}
    <Pressable accessibilityRole="button" accessibilityLabel="Check catalog isolation" disabled={busy}
      onPress={() => { void checkIsolation(); }} style={styles.button}>
      <Text style={styles.buttonText}>Check catalog isolation</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1018', padding: 24, paddingTop: 90, gap: 16 },
  title: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
  text: { color: '#ffffff', fontSize: 17 },
  button: { backgroundColor: '#0c766e', borderRadius: 8, padding: 18, marginTop: 16 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
});
