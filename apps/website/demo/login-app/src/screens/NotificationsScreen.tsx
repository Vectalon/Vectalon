import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNotifications } from '../hooks/useNotifications';
import { Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export function NotificationsScreen(_props: Props) {
  const { notifications, loading, error } = useNotifications();

  if (loading) {
    return (
      <Screen title="Notifications">
        <ActivityIndicator style={styles.center} />
      </Screen>
    );
  }

  return (
    <Screen title="Notifications">
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      <FlatList
        data={notifications}
        keyExtractor={n => n.id}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.read && styles.unread]}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: 40 },
  error: { color: '#ff3b30', marginBottom: 12 },
  list: { gap: 10 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 14 },
  unread: { borderColor: '#0a84ff', backgroundColor: '#f0f7ff' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardBody: { fontSize: 14, color: '#4b5563', marginTop: 4 },
});
