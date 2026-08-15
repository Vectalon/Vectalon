import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button } from '../components/ui';
import { authApi, type Session } from '../services/AuthApi';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const [session, setSession] = React.useState<Session | null>(null);

  React.useEffect(() => {
    void authApi.login('demo@vectalon.in', 'password123').then(setSession);
  }, []);

  return (
    <Screen title="Profile">
      {session ? (
        <View>
          <Text style={styles.name}>{session.user.name}</Text>
          <Text style={styles.meta}>{session.user.email}</Text>
          <Text style={styles.meta}>Session {session.token}</Text>
        </View>
      ) : (
        <Text style={styles.meta}>Loading…</Text>
      )}
      <Button label="Settings" variant="secondary" onPress={() => navigation.navigate('Settings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '600' },
  meta: { fontSize: 14, color: '#6b7280', marginTop: 6 },
});
