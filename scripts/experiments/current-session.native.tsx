import React from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen, Button } from './src/components/ui';
import { useSecuritySettings } from './src/hooks/useSecuritySettings';

// Disposable native probe: copy to App.tsx beside the evaluated hook; never ship it.
function SessionProbe() {
  const { sessions, revokeSession, twoFactorEnabled, toggleTwoFactor } = useSecuritySettings();
  return (
    <Screen title="Session regression probe">
      <Text>{`Current sessions: ${sessions.filter(session => session.current).length}`}</Text>
      <Text>{`Other sessions: ${sessions.filter(session => !session.current).length}`}</Text>
      <Text>{`Two factor: ${twoFactorEnabled ? 'on' : 'off'}`}</Text>
      <Button label="Try current and unknown IDs" onPress={() => {
        const current = sessions.find(session => session.current);
        if (current) revokeSession(current.id);
        revokeSession('unknown-session');
      }} />
      <Button label="Revoke other sessions" onPress={() => {
        for (const session of sessions.filter(session => !session.current)) revokeSession(session.id);
      }} />
      <Button label="Toggle two factor" onPress={toggleTwoFactor} />
    </Screen>
  );
}

export default function App() {
  return <SafeAreaProvider><SessionProbe /></SafeAreaProvider>;
}
