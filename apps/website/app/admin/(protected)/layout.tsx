import { redirect } from 'next/navigation'
import { isAdmin } from '../../../lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) {
    redirect('/admin/login')
  }
  return <>{children}</>
}
