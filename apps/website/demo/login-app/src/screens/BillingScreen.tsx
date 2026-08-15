import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Billing'>;

const INVOICES = [
  { id: 'INV-2026-008', amount: 19, date: '2026-08-01' },
  { id: 'INV-2026-007', amount: 19, date: '2026-07-01' },
  { id: 'INV-2026-006', amount: 19, date: '2026-06-01' },
];

export function BillingScreen(_props: Props) {
  return (
    <Screen title="Billing">
      <View style={styles.plan}>
        <Text style={styles.planName}>Pro plan</Text>
        <Text style={styles.planPrice}>$19 / month</Text>
      </View>
      <Text style={styles.section}>Invoices</Text>
      {INVOICES.map(i => (
        <View key={i.id} style={styles.invoice}>
          <Text style={styles.invoiceId}>{i.id}</Text>
          <Text style={styles.invoiceMeta}>
            ${i.amount} · {i.date}
          </Text>
        </View>
      ))}
      <Button label="Manage plan" variant="secondary" onPress={() => undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  plan: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 16 },
  planName: { fontSize: 17, fontWeight: '700' },
  planPrice: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  invoice: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  invoiceId: { fontSize: 14, fontWeight: '500' },
  invoiceMeta: { fontSize: 13, color: '#6b7280' },
});
