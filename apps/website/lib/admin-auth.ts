/** Dashboard reads require a current durable GitHub operator session. */
import { operatorAuthorization } from './operator-host'

export const ADMIN_COOKIE = 'vectalon_admin'
export async function isAdmin(): Promise<boolean> {
  return (await operatorAuthorization()).ok
}
