import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button } from '../components/ui';
import { useCart } from '../hooks/useCart';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const LINKS: Array<{ label: string; route: 'Catalog' | 'Orders' | 'Notifications' | 'Security' | 'Billing' | 'Profile' | 'Activity' | 'Support' }> = [
  { label: 'Shop the catalog', route: 'Catalog' },
  { label: 'Your orders', route: 'Orders' },
  { label: 'Notifications', route: 'Notifications' },
  { label: 'Security', route: 'Security' },
  { label: 'Billing', route: 'Billing' },
  { label: 'Profile', route: 'Profile' },
  { label: 'Activity', route: 'Activity' },
  { label: 'Support', route: 'Support' },
];

export function HomeScreen({ navigation }: Props) {
  const { count } = useCart();

  return (
    <Screen title="Dashboard">
      <Text style={styles.subtitle}>Signed in — cart has {count} item{count === 1 ? '' : 's'}.</Text>
      {LINKS.map(l => (
        <Button key={l.label} label={l.label} variant="secondary" onPress={() => navigation.navigate(l.route)} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 } });
