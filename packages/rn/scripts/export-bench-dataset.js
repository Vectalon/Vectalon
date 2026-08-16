#!/usr/bin/env node
/**
 * Export the built-in benchmark pack (scenarios + human reference solutions)
 * as a LoRA fine-tuning dataset — JSONL, chat format — under
 * <repo-root>/.vectalon/dataset/bench-pack.jsonl.
 *
 * Each line is one training example:
 *   { id, messages: [system, user, assistant], label, meta }
 *
 * The assistant turn is the human reference solution (the same files that
 * score as the "human baseline" on /benchmarks), so a model fine-tuned on
 * this pack is trained toward the exact quality bar the leaderboard measures
 * against. Deterministic — no model calls.
 *
 * Usage: node scripts/export-bench-dataset.js [--out <dir>]
 */

const fs = require('fs')
const path = require('path')

const SCRIPTS_DIR = __dirname
const PACKAGE_ROOT = path.join(SCRIPTS_DIR, '..')
const REPO_ROOT = path.join(PACKAGE_ROOT, '..', '..')
const SCENARIOS_DIR = path.join(PACKAGE_ROOT, 'bench', 'scenarios')
const REFERENCES_DIR = path.join(PACKAGE_ROOT, 'bench', 'references')

const outFlag = process.argv.indexOf('--out')
const OUT_DIR = outFlag !== -1
  ? path.resolve(process.argv[outFlag + 1])
  : path.join(REPO_ROOT, '.vectalon', 'dataset')

const SYSTEM_PROMPT =
  'You are an expert React Native engineer. Write production-grade, ' +
  'strictly-typed, accessible React Native code that fully satisfies the ' +
  'task. Respect the project fixtures (dependencies, TypeScript config, ' +
  'lint rules), keep state updates immutable, use KeyboardAvoidingView on ' +
  'form screens, handle loading and error states on every async operation, ' +
  'and add accessibility labels and roles to interactive elements.'

/** Compact markdown block for one fixture file. */
function fixtureBlock(fixtures) {
  return Object.entries(fixtures)
    .map(([p, content]) => `\`\`\`\n${p}\n\`\`\`\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n')
}

/** Build the user turn: task prompt + project context + deliverables. */
function userTurn(scenario) {
  const parts = []
  parts.push(`## Task\n\n${scenario.prompt}`)
  if (scenario.fixtures && Object.keys(scenario.fixtures).length > 0) {
    parts.push(`## Project context (existing files)\n\n${fixtureBlock(scenario.fixtures)}`)
  }
  const expect = scenario.expect
  if (expect) {
    if (expect.files && expect.files.length > 0) {
      parts.push(`## Files to create or modify\n\n${expect.files.map(f => `- \`${f}\``).join('\n')}`)
    }
    if (expect.behaviors && expect.behaviors.length > 0) {
      parts.push(`## Behaviors required\n\n${expect.behaviors.map(b => `- ${b}`).join('\n')}`)
    }
  }
  return parts.join('\n\n')
}

/** Build the assistant turn: each reference file as a code block. */
function assistantTurn(reference) {
  return reference.files
    .map(f => `\`\`\`\n${f.path}\n\`\`\`\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n')
}

function main() {
  const scenarioFiles = fs.readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json')).sort()
  const examples = []
  let skipped = []

  for (const file of scenarioFiles) {
    const id = file.replace(/\.json$/, '')
    const scenario = JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, file), 'utf-8'))
    const refPath = path.join(REFERENCES_DIR, file)
    if (!fs.existsSync(refPath)) {
      skipped.push(`${id} (no reference)`)
      continue
    }
    const reference = JSON.parse(fs.readFileSync(refPath, 'utf-8'))
    examples.push({
      id,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userTurn(scenario) },
        { role: 'assistant', content: assistantTurn(reference) },
      ],
      label: scenario.suite,
      meta: {
        scenario: id,
        title: scenario.title,
        suite: scenario.suite,
        axes: scenario.axes ?? ['correctness', 'adherence', 'guardrails'],
        scaffoldable: scenario.scaffoldable ?? true,
      },
    })
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const outFile = path.join(OUT_DIR, 'bench-pack.jsonl')
  const lines = examples.map(e => JSON.stringify(e))
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf-8')

  const sizes = examples.map(e => e.messages[2].content.length)
  const total = sizes.reduce((a, b) => a + b, 0)
  const min = Math.min(...sizes)
  const max = Math.max(...sizes)
  const median = sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]

  console.log(`Wrote ${examples.length} training examples → ${outFile}`)
  if (skipped.length > 0) console.log(`Skipped (no reference): ${skipped.join(', ')}`)
  console.log(`Assistant-turn length (chars): min ${min} · median ${median} · max ${max} · total ${total}`)
  const labels = {}
  for (const e of examples) labels[e.label] = (labels[e.label] || 0) + 1
  console.log('Label balance:', JSON.stringify(labels))
}

main()
