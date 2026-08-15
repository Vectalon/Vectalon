import React, { useState } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLogin } from '../hooks/useLogin';
import { Screen, TextField, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, session } = useLogin();

  React.useEffect(() => {
    if (session) navigation.replace('Home');
  }, [session, navigation]);

  return (
    <Screen title="Sign in">
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextField value={email} onChangeText={setEmail} placeholder="you@company.dev" keyboardType="email-address" autoCapitalize="none" />
        <TextField value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
        {error ? <Text style={styles.error}>{error.message}</Text> : null}
        <Button label="Sign in" onPress={() => void login(email, password)} loading={loading} />
        <Button label="Create account" variant="secondary" onPress={() => navigation.navigate('Signup')} />
        <Button label="Forgot password?" variant="secondary" onPress={() => navigation.navigate('ForgotPassword')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { color: '#ff3b30', marginTop: 12 } });
