import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Activity'>;

const EVENTS = [
  { id: 'e1', text: 'Signed in from iPhone 16', at: '2026-08-15 09:12' },
  { id: 'e2', text: 'Order o_1043 shipped', at: '2026-08-10 08:30' },
  { id: 'e3', text: 'Password changed', at: '2026-08-02 17:45' },
  { id: 'e4', text: 'Signed in from MacBook Pro', at: '2026-08-01 08:02' },
  { id: 'e5', text: 'Account created', at: '2026-07-28 11:20' },
];

export function ActivityScreen(_props: Props) {
  return (
    <Screen title="Activity">
      {EVENTS.map(e => (
        <View key={e.id} style={styles.item}>
          <Text style={styles.text}>{e.text}</Text>
          <Text style={styles.at}>{e.at}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  text: { fontSize: 15 },
  at: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
});
