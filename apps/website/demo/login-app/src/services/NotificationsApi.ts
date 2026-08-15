export interface AppNotification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const SEED: AppNotification[] = [
  { id: 'n1', title: 'Welcome', body: 'Thanks for joining the demo app.', read: false, createdAt: '2026-08-01T09:00:00Z' },
  { id: 'n2', title: 'Security check', body: 'A new device signed in to your account.', read: false, createdAt: '2026-08-10T14:30:00Z' },
  { id: 'n3', title: 'Release notes', body: 'v1.0.0 is live — dark mode included.', read: true, createdAt: '2026-07-28T18:00:00Z' },
];

export class NotificationsApi {
  async list(): Promise<AppNotification[]> {
    return SEED.map(n => ({ ...n }));
  }

  async markRead(id: string): Promise<void> {
    const n = SEED.find(x => x.id === id);
    if (n) n.read = true;
  }

  async markAllRead(): Promise<void> {
    for (const n of SEED) n.read = true;
  }

  async unreadCount(): Promise<number> {
    return SEED.filter(n => !n.read).length;
  }
}

export const notificationsApi = new NotificationsApi();
