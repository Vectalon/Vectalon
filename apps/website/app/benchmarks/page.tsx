import { MODEL_RESULTS, TASK_OUTCOMES, REPAIR_TASK_OUTCOMES } from '../../lib/benchmarkData'

export const metadata = {
  title: 'React Native engineering evidence — Vectalon',
  description: 'Measured React Native task outcomes and benchmark limits for Vectalon.',
}

export default function BenchmarksPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header>
        <span className="chip font-mono">React Native / Expo · development evidence</span>
        <h1 className="mt-5 text-4xl font-bold text-slate-50 sm:text-5xl">What Vectalon has proved so far</h1>
        <p className="mt-4 max-w-3xl text-slate-300">
          Our goal is to help your chosen model complete more verified engineering tasks in your app.
          We publish both passes and misses from same-model development checks. A promising review
          result is not yet evidence of reliable improvement or a qualified model.
        </p>
      </header>

      <section aria-labelledby="task-outcomes" className="mt-12">
        <h2 id="task-outcomes" className="text-2xl font-semibold text-slate-50">Verified app checks</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Qwen2.5-Coder 7B in one installed Expo 58 / React Native 0.88 app. Each public development
          task ran three times with the task alone and three times with Vectalon guidance. A pass
          required the pinned model identity, TypeScript check and task tests. These were first attempts;
          no repair was used.
        </p>
        <div className="card !p-0 mt-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[560px]">
              <caption className="sr-only">App check passes by task and condition</caption>
              <thead>
                <tr><th scope="col">Task</th><th scope="col">Task alone</th><th scope="col">With Vectalon</th><th scope="col">Observed difference</th></tr>
              </thead>
              <tbody>
                {TASK_OUTCOMES.map(task => (
                  <tr key={task.id}>
                    <th scope="row" className="text-left font-normal">
                      <span className="text-slate-200">{task.skill}</span>
                      <span className="block font-mono text-xs text-slate-500">{task.id}</span>
                    </th>
                    <td className="font-mono text-slate-300">{task.taskOnlyPasses}/{task.taskOnlyPlanned}</td>
                    <td className="font-mono text-slate-300">{task.guidedPasses}/{task.guidedPlanned}</td>
                    <td className="text-sm text-slate-400">
                      {task.guidedPasses === task.taskOnlyPasses ? 'None in this sample' :
                        `${task.guidedPasses - task.taskOnlyPasses > 0 ? '+' : ''}${task.guidedPasses - task.taskOnlyPasses} passes`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          All 18 attempts completed. One catalog fix also passed a narrow iOS simulator probe, but
          both conditions passed its app checks 3/3. This comparison does not establish a benefit.
          Tasks are public development checks, not unseen release qualification.
        </p>
        <a className="mt-3 inline-block text-sm text-brand hover:underline" href="https://github.com/Vectalon/Vectalon/blob/main/docs/release-roadmap/evidence/one-app-v2-comparison-2026-10-25.md">
          Read the task evidence and limitations →
        </a>
      </section>

      <section aria-labelledby="repair-outcomes" className="mt-16">
        <h2 id="repair-outcomes" className="text-2xl font-semibold text-slate-50">Latest bounded comparison</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          The same pinned Qwen2.5-Coder 7B model attempted a new feature and review task in the
          installed app, three times per condition. Both sides had the same call, output-token and
          time limits. First-attempt passes and repair-selected passes are separate; a pass here
          means TypeScript and task tests passed, not native or customer qualification.
        </p>
        <div className="card !p-0 mt-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[660px]">
              <caption className="sr-only">First-attempt and repair-selected app passes in the bounded comparison</caption>
              <thead><tr><th scope="col">Task</th><th scope="col">Task alone, first</th><th scope="col">With Vectalon, first</th><th scope="col">Task alone, repair</th><th scope="col">With Vectalon, repair</th></tr></thead>
              <tbody>
                {REPAIR_TASK_OUTCOMES.map(task => (
                  <tr key={task.id}>
                    <th scope="row" className="text-left font-mono text-sm font-normal text-slate-200">{task.id}</th>
                    <td className="font-mono text-slate-300">{task.taskOnlyFirst}/{task.taskOnlyRuns}</td>
                    <td className="font-mono text-slate-300">{task.guidedFirst}/{task.guidedRuns}</td>
                    <td className="font-mono text-slate-300">{task.taskOnlyAssisted}/{task.taskOnlyRuns}</td>
                    <td className="font-mono text-slate-300">{task.guidedAssisted}/{task.guidedRuns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          The feature failed in both conditions. The guided review passed app checks 3/3, but its
          recorded guardrail score was below the launch gate; a later rule correction was not new
          inference. A separate JSON-grammar follow-up completed only one failing pair before a
          memory safety stop. A later source-grounded edit attempt produced no candidate: the
          local 7B provider refused for insufficient memory, leaving two planned repeats unrun.
          These are public development tasks, not unseen or native proof.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a className="text-brand hover:underline" href="https://github.com/Vectalon/Vectalon/blob/main/docs/release-roadmap/evidence/paired-repair-7b-2026-10-27.json">Bounded comparison evidence →</a>
          <a className="text-brand hover:underline" href="https://github.com/Vectalon/Vectalon/blob/main/docs/release-roadmap/evidence/paired-grammar-7b-2026-10-27.json">Grammar follow-up and memory stop →</a>
          <a className="text-brand hover:underline" href="https://github.com/Vectalon/Vectalon/blob/main/docs/release-roadmap/evidence/scoped-cart-7b-capacity-2026-10-27.json">Edit-attempt capacity refusal →</a>
        </div>
      </section>

      <section aria-labelledby="rubric-results" className="mt-16">
        <h2 id="rubric-results" className="text-2xl font-semibold text-slate-50">Older benchmark scores</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          These committed model runs score generated files against fixture checks and an RN rubric.
          Each run covers a different number of scenarios, so the percentages are not a controlled
          comparison or evidence that Vectalon improved a model. The reference solutions were
          assistant-authored and have not been independently validated as human performance.
        </p>
        <div className="card !p-0 mt-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[500px]">
              <caption className="sr-only">Committed benchmark scores by local model</caption>
              <thead><tr><th scope="col">Local model</th><th scope="col">Scenarios</th><th scope="col">Composite</th><th scope="col">Guardrails</th></tr></thead>
              <tbody>
                {MODEL_RESULTS.map(result => (
                  <tr key={result.file}>
                    <th scope="row" className="text-left font-normal text-slate-200">{result.model}</th>
                    <td className="font-mono text-slate-300">{result.scenarios}</td>
                    <td className="font-mono text-slate-300">{result.composite ?? 'unscored'}{result.composite === null ? '' : '%'}</td>
                    <td className="font-mono text-slate-300">{result.guardrails ?? 'unscored'}{result.guardrails === null ? '' : '%'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Source: committed RN benchmark JSON files. Scores are historical fixture and rubric evidence;
          the published package may differ from current repository source.
        </p>
      </section>

      <section aria-labelledby="next-evidence" className="mt-16 card">
        <h2 id="next-evidence" className="text-xl font-semibold text-slate-50">What we still need to prove</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">
          <li>Resolve the feature failures and repeat a complete same-model comparison; the latest grammar follow-up stopped early under its memory guard.</li>
          <li>Repeat on unseen tasks across installed RN and Expo apps, with native checks and visible failures.</li>
          <li>Measure developer correction time and confirm useful workflows with external developers.</li>
        </ul>
        <p className="mt-4 text-sm text-slate-300">
          No model or workflow is qualified for an improvement claim from the evidence above.
        </p>
      </section>
    </div>
  )
}
