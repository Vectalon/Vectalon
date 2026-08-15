import React, { useState } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSignup } from '../hooks/useSignup';
import { Screen, TextField, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signup, loading, error, session } = useSignup();

  React.useEffect(() => {
    if (session) navigation.replace('Home');
  }, [session, navigation]);

  return (
    <Screen title="Create account">
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextField value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" />
        <TextField value={email} onChangeText={setEmail} placeholder="you@company.dev" keyboardType="email-address" autoCapitalize="none" />
        <TextField value={password} onChangeText={setPassword} placeholder="Password (6+ characters)" secureTextEntry />
        {error ? <Text style={styles.error}>{error.message}</Text> : null}
        <Button label="Sign up" onPress={() => void signup(name, email, password)} loading={loading} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { color: '#ff3b30', marginTop: 12 } });
