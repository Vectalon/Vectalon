import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Support'>;

const FAQ = [
  { q: 'How do I reset my password?', a: 'Use Forgot password on the sign-in screen — a reset link lands in your inbox.' },
  { q: 'Where are my invoices?', a: 'Open Billing from the dashboard. Every invoice is downloadable there.' },
  { q: 'How do I secure my account?', a: 'Open Security to enable two-factor authentication and review active sessions.' },
];

export function SupportScreen(_props: Props) {
  return (
    <Screen title="Support">
      {FAQ.map(f => (
        <View key={f.q} style={styles.item}>
          <Text style={styles.q}>{f.q}</Text>
          <Text style={styles.a}>{f.a}</Text>
        </View>
      ))}
      <Button label="Contact support" variant="secondary" onPress={() => undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { marginBottom: 16 },
  q: { fontSize: 15, fontWeight: '600' },
  a: { fontSize: 14, color: '#6b7280', marginTop: 4, lineHeight: 20 },
});
