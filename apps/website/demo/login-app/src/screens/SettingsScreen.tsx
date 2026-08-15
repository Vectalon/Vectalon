import React, { useState } from 'react';
import { Switch } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Row, Button } from '../components/ui';
import { useCart } from '../hooks/useCart';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [dark, setDark] = useState(false);
  const [push, setPush] = useState(true);
  const { count } = useCart();

  return (
    <Screen title="Settings">
      <Row label="Dark mode">
        <Switch value={dark} onValueChange={setDark} accessibilityLabel="Dark mode" />
      </Row>
      <Row label="Push notifications">
        <Switch value={push} onValueChange={setPush} accessibilityLabel="Push notifications" />
      </Row>
      <Button label={`Open catalog (${count} in cart)`} variant="secondary" onPress={() => navigation.navigate('Catalog')} />
      <Button label="Notifications" variant="secondary" onPress={() => navigation.navigate('Notifications')} />
      <Button label="Profile" variant="secondary" onPress={() => navigation.navigate('Profile')} />
      <Button label="Security" variant="secondary" onPress={() => navigation.navigate('Security')} />
      <Button label="Billing" variant="secondary" onPress={() => navigation.navigate('Billing')} />
    </Screen>
  );
}
