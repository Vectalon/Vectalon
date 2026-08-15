/**
 * Auth service for the demo app. A real app would call a backend; this
 * in-memory mock keeps the demo fully offline and deterministic so the
 * recorded session is reproducible.
 */
export interface Session {
  token: string;
  user: { id: string; email: string; name: string };
  issuedAt: string;
}

export class AuthApi {
  async login(email: string, password: string): Promise<Session> {
    if (!email.includes('@')) throw new Error('Invalid email address');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    return {
      token: `tok_${email.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      user: { id: 'u_1', email, name: email.split('@')[0] },
      issuedAt: new Date().toISOString(),
    };
  }

  async signup(name: string, email: string, password: string): Promise<Session> {
    if (!name.trim()) throw new Error('Name is required');
    if (!email.includes('@')) throw new Error('Invalid email address');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    return {
      token: `tok_new_${email.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      user: { id: 'u_2', email, name: name.trim() },
      issuedAt: new Date().toISOString(),
    };
  }

  async requestPasswordReset(email: string): Promise<{ sentTo: string }> {
    if (!email.includes('@')) throw new Error('Invalid email address');
    return { sentTo: email };
  }

  async signOut(): Promise<void> {
    return undefined;
  }
}

export const authApi = new AuthApi();
