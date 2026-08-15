import { useState, useCallback } from 'react';

export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
}

const SESSIONS: ActiveSession[] = [
  { id: 's1', device: 'iPhone 16 · iOS 19', location: 'San Francisco, US', lastActive: 'now', current: true },
  { id: 's2', device: 'MacBook Pro · Chrome', location: 'San Francisco, US', lastActive: '2h ago', current: false },
  { id: 's3', device: 'Pixel 9 · Android 16', location: 'Austin, US', lastActive: '3d ago', current: false },
];

export function useSecuritySettings(): {
  twoFactorEnabled: boolean;
  toggleTwoFactor: () => void;
  sessions: ActiveSession[];
  revokeSession: (id: string) => void;
} {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessions, setSessions] = useState<ActiveSession[]>(SESSIONS);

  const toggleTwoFactor = useCallback(() => setTwoFactorEnabled(prev => !prev), []);
  const revokeSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  return { twoFactorEnabled, toggleTwoFactor, sessions, revokeSession };
}
