import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useForgotPassword } from '../hooks/useForgotPassword';
import { Screen, TextField, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const { request, loading, error, sentTo } = useForgotPassword();

  return (
    <Screen title="Reset password">
      {sentTo ? (
        <Text style={styles.ok}>Reset link sent to {sentTo}. Check your inbox.</Text>
      ) : (
        <>
          <TextField value={email} onChangeText={setEmail} placeholder="you@company.dev" keyboardType="email-address" autoCapitalize="none" />
          {error ? <Text style={styles.error}>{error.message}</Text> : null}
          <Button label="Send reset link" onPress={() => void request(email)} loading={loading} />
        </>
      )}
      <Button label="Back to sign in" variant="secondary" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: '#ff3b30', marginTop: 12 },
  ok: { color: '#22c55e', marginTop: 12, fontSize: 16 },
});
