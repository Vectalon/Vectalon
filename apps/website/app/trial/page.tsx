import Link from 'next/link'

export default function TrialPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-slate-50">Start your 14-day Pro trial</h1>
        <p className="mt-3 text-slate-400">No credit card and no repository access. Verify your identity with GitHub directly from the Vectalon CLI.</p>
      </div>
      <div className="card space-y-5">
        <div>
          <p className="text-sm font-medium text-slate-300">Run this in your project</p>
          <code className="mt-2 block rounded-lg code-bg px-4 py-3 font-mono text-sm text-emerald-600">npx vectalon auth --github</code>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-400">
          <li>Open the GitHub verification link shown by the CLI.</li>
          <li>Enter the one-time code and approve sign-in.</li>
          <li>The CLI securely stores your signed Pro trial credential.</li>
        </ol>
        <p className="text-xs text-slate-500">Vectalon verifies your stable GitHub account ID to enforce one trial per person. Your username is display-only; repository scopes and a payment card are not requested. You can request an export or deletion at <a className="text-brand hover:underline" href="mailto:privacy@vectalon.in">privacy@vectalon.in</a>.</p>
      </div>
      <div className="mt-6 text-center text-xs text-slate-500">
        Already have a license? <Link href="/pricing" className="text-brand hover:underline">See pricing</Link> — <Link href="/docs" className="text-brand hover:underline">Read the docs</Link>
      </div>
    </div>
  )
}
