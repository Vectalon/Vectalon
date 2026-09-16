'use client'
import { useEffect,useState } from 'react'
import Link from 'next/link'
import { operatorMutationHeaders } from '../../../../lib/operator-client'
type Operator={ subject:string; github_login:string; role:string; active:boolean }
const roles=['viewer','support','billing','license','security','platform']
export function OperatorAccessPanel() {
  const [operators,setOperators]=useState<Operator[]>([])
  const [login,setLogin]=useState(''),[role,setRole]=useState('support'),[reason,setReason]=useState('')
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  async function reload() {
    const response=await fetch('/api/admin/operators',{ cache:'no-store' })
    const body=await response.json()
    if (!response.ok) { setMessage(body.error??'Access unavailable');return }
    setOperators(body.operators)
  }
  useEffect(()=>{ let canceled=false;fetch('/api/admin/operators',{ cache:'no-store' }).then(async response=>{ const body=await response.json();if (!canceled) { if (response.ok) setOperators(body.operators);else setMessage(body.error??'Access unavailable') } }).catch(()=>{ if (!canceled) setMessage('Connection failed') });return()=>{ canceled=true } },[])
  async function change(input:object) {
    if (reason.trim().length<3) { setMessage('Enter an audit reason first.');return }
    setBusy(true);setMessage('')
    try {
      const response=await fetch('/api/admin/operators',{ method:'POST',headers:operatorMutationHeaders(reason),body:JSON.stringify({ ...input,reason }) })
      const body=await response.json()
      if (!response.ok) { setMessage(body.error??'Access change failed');return }
      setMessage('Access updated. Previous sessions for this account are revoked.');setLogin('');await reload()
    } catch { setMessage('Connection failed') } finally { setBusy(false) }
  }
  async function downloadLease() {
    if (reason.trim().length<3) { setMessage('Enter an audit reason first.');return }
    setBusy(true);setMessage('')
    try {
      const response=await fetch('/api/admin/sdk-access',{ method:'POST',headers:operatorMutationHeaders(reason),body:JSON.stringify({ reason }) })
      const body=await response.json()
      if (!response.ok) { setMessage(body.error??'SDK access unavailable');return }
      const url=URL.createObjectURL(new Blob([body.credential],{ type:'text/plain' }))
      const link=document.createElement('a');link.href=url;link.download='vectalon-operator-license.txt';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
      setMessage(`Internal credential downloaded. Expires ${new Date(body.expiresAt).toLocaleTimeString()}. Keep it private; delete after use.`)
    } catch { setMessage('Download failed') } finally { setBusy(false) }
  }
  return <section className="space-y-6">
    <div><h1 className="text-2xl font-bold text-slate-50">Operator access</h1><p className="mt-2 text-sm text-slate-400">Manage GitHub admins and internal SDK access. Existing customer subscriptions and licenses remain unchanged.</p></div>
    <label className="block text-sm text-slate-300">Audit reason<input className="input mt-2" value={reason} onChange={event=>setReason(event.target.value)} minLength={3} maxLength={500} required placeholder="Why is this access needed?" /></label>
    <div className="card space-y-4"><h2 className="font-semibold text-slate-50">Add an administrator</h2><form onSubmit={event=>{ event.preventDefault();void change({ githubLogin:login,role,active:true }) }} className="flex flex-wrap gap-3"><label className="flex-1 text-sm text-slate-400">GitHub username<input className="input" value={login} onChange={event=>setLogin(event.target.value)} required maxLength={39}/></label><label className="text-sm text-slate-400">Role<select className="input" value={role} onChange={event=>setRole(event.target.value)}>{roles.map(value=><option key={value}>{value}</option>)}</select></label><button disabled={busy} className="btn-primary self-end">Add access</button></form></div>
    <div className="card space-y-4">
      <h2 className="font-semibold text-slate-50">Current administrators</h2>
      {operators.map(operator=><div key={operator.subject} className="flex flex-wrap items-center gap-3 border-b border-ink-700 pb-3">
        <span className="flex-1 text-sm text-slate-300">{operator.github_login} · {operator.active?'Active':'Revoked'}</span>
        <select aria-label={`Role for ${operator.github_login}`} className="input w-32" value={operator.role}
          onChange={event=>{ setOperators(current=>current.map(row=>row.subject===operator.subject?{ ...row,role:event.target.value }:row)) }}>
          {roles.map(value=><option key={value}>{value}</option>)}
        </select>
        <button disabled={busy} className="btn-primary" onClick={()=>void change({ subject:operator.subject,role:operator.role,active:true })}>Save</button>
        <button disabled={busy||!operator.active} className="text-sm text-red-300" onClick={()=>{
          if (confirm(`Revoke admin access for ${operator.github_login}? Their sessions will be revoked; customer licenses are unchanged.`)) void change({ subject:operator.subject,role:operator.role,active:false })
        }}>Revoke</button>
      </div>)}
      <p className="text-xs text-slate-500">The last active platform administrator cannot be removed. Platform grants full operator authority; choose narrower roles for other users.</p>
    </div>
    <div className="card space-y-3"><h2 className="font-semibold text-slate-50">Internal developer access</h2><p className="text-sm text-slate-400">Platform admins receive full RN package tier access without commercial quotas. Each signed credential lasts five minutes. Provider costs, safety restrictions, experimental opt-in and availability still apply.</p><button disabled={busy} className="btn-primary" onClick={()=>void downloadLease()}>Download internal credential</button><p className="text-xs text-slate-400">In the download folder, run:</p><pre className="overflow-x-auto text-xs text-slate-300">{'chmod 600 vectalon-operator-license.txt\nnpx @vectalon-dev/rn auth --operator-license-file ./vectalon-operator-license.txt'}</pre><p className="text-xs text-slate-500">Stored separately from paid licenses. Download and activate a fresh credential when it expires.</p></div>
    {message&&<p role="status" className="text-sm text-slate-300">{message}</p>}<Link href="/admin/login" className="text-sm text-brand">Sign in again for privileged actions</Link>
  </section>
}
