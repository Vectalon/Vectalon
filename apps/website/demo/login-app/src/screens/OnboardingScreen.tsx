import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const HIGHLIGHTS = [
  { icon: '🔐', text: 'One account, every device' },
  { icon: '🛒', text: 'Order tracking in real time' },
  { icon: '🔔', text: 'Smart notifications, no noise' },
];

export function OnboardingScreen({ navigation }: Props) {
  return (
    <Screen title="Welcome">
      {HIGHLIGHTS.map(h => (
        <View key={h.text} style={styles.item}>
          <Text style={styles.icon}>{h.icon}</Text>
          <Text style={styles.text}>{h.text}</Text>
        </View>
      ))}
      <Button label="Continue" onPress={() => navigation.replace('Login')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  icon: { fontSize: 28 },
  text: { fontSize: 16, flex: 1 },
});
