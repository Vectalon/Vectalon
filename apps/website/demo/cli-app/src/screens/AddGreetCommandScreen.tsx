import React from 'react';
import { Text, Pressable, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useAddGreetCommand } from '../hooks/useAddGreetCommand';

export function AddGreetCommandScreen(): React.JSX.Element {
  const { run, loading, error, data } = useAddGreetCommand();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AddGreetCommand</Text>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      {data ? <Text>{data}</Text> : null}
      <Pressable
        style={styles.button}
        onPress={run}
        disabled={loading}
        accessibilityLabel="Run AddGreetCommand"
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Run</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },
  error: { color: "#FF3B30", marginBottom: 12 },
  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, borderCurve: "continuous", alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
