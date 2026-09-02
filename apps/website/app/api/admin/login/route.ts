import { NextResponse } from 'next/server'
import { adminPassword, adminSessionToken, ADMIN_COOKIE } from '../../../../lib/admin-auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  const expectedPassword = adminPassword()
  const token = adminSessionToken()
  if (!expectedPassword || !token || body.password !== expectedPassword) {
    return NextResponse.json({ ok: false, error: 'invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  return res
}
