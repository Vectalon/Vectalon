'use client'
import { useEffect,useState } from 'react'
import { useRouter } from 'next/navigation'
type Challenge={ userCode:string; interval:number; expiresAt:number }
export default function AdminLoginPage() {
  const router=useRouter()
  const [challenge,setChallenge]=useState<Challenge|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    if (!challenge) return
    let canceled=false
    let timer:ReturnType<typeof setTimeout>
    async function poll() {
      if (canceled) return
      if (Date.now()>=challenge!.expiresAt) { setError('Authorization expired. Start again.');setChallenge(null);return }
      try {
        const response=await fetch('/api/admin/login/poll',{ method:'POST',credentials:'same-origin',cache:'no-store' })
        const body=await response.json()
        if (canceled) return
        if (response.ok && body.status==='complete') { router.replace('/admin/access');router.refresh();return }
        if (response.status===202 || response.status===429) {
          const interval=response.status===429 ? Math.max(challenge!.interval,Number(body.interval)||Number(response.headers.get('retry-after'))||10) : challenge!.interval
          timer=setTimeout(poll,Math.min(900,interval)*1000);return
        }
        setError(response.status===403?'GitHub authorization denied or this account has no active admin access.':body.error??'Sign-in failed. Please retry.')
        setChallenge(null)
      } catch { if (!canceled) { setError('Connection failed. Please retry.');setChallenge(null) } }
    }
    timer=setTimeout(poll,challenge.interval*1000)
    return ()=>{ canceled=true;clearTimeout(timer) }
  },[challenge,router])
  async function start() {
    setBusy(true);setError('');setChallenge(null)
    try {
      const response=await fetch('/api/admin/login',{ method:'POST',credentials:'same-origin',cache:'no-store' })
      const body=await response.json()
      if (!response.ok) { setError(body.error??'Sign-in unavailable.');return }
      setChallenge({ userCode:body.userCode,interval:body.interval,expiresAt:Date.now()+body.expiresIn*1000 })
    } catch { setError('Connection failed. Please retry.') } finally { setBusy(false) }
  }
  return <div className="mx-auto max-w-sm px-4 py-24"><div className="card space-y-5">
    <h1 className="text-xl font-bold text-slate-50">Admin sign-in</h1>
    <p className="text-sm text-slate-400">Sign in with GitHub. Only active, approved operator accounts can access this dashboard.</p>
    {challenge?<div className="space-y-3" aria-live="polite"><p className="text-sm text-slate-300">Enter this code on GitHub:</p><code className="block text-center text-2xl text-brand">{challenge.userCode}</code><a href="https://github.com/login/device" target="_blank" rel="noopener noreferrer" className="btn-primary block text-center">Authorize on GitHub</a><p className="text-xs text-slate-500">Waiting for approval. Only approve the code shown here.</p></div>:<button onClick={start} disabled={busy} className="btn-primary w-full">{busy?'Connecting…':'Sign in with GitHub'}</button>}
    {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
    <p className="text-xs text-slate-500">Sessions expire after eight hours or 15 minutes idle. Privileged actions require a sign-in within five minutes.</p>
  </div></div>
}
