import React from 'react';
import { FlatList, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSecuritySettings } from '../hooks/useSecuritySettings';
import { Screen, Row, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Security'>;

export function SecurityScreen(_props: Props) {
  const { twoFactorEnabled, toggleTwoFactor, sessions, revokeSession } = useSecuritySettings();

  return (
    <Screen title="Security">
      <Row label="Two-factor authentication">
        <Switch value={twoFactorEnabled} onValueChange={toggleTwoFactor} accessibilityLabel="Two-factor authentication" />
      </Row>
      <Text style={{ fontSize: 15, fontWeight: '600', marginTop: 18, marginBottom: 8 }}>Active sessions</Text>
      <FlatList
        data={sessions}
        keyExtractor={s => s.id}
        renderItem={({ item }) => (
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 14, marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '600' }}>
              {item.device} {item.current ? '· this device' : ''}
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {item.location} · {item.lastActive}
            </Text>
            {!item.current && <Button label="Revoke" variant="danger" onPress={() => revokeSession(item.id)} />}
          </View>
        )}
      />
    </Screen>
  );
}
