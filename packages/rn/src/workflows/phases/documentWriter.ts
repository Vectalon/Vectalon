import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface DocumentEntry {
  phase: string
  title: string
  content: string
}

/**
 * Workflow documents land in the project's `docs/vectalon/<workflow>/<run>/`
 * directory so the team sees them in version control — the `.vectalon/`
 * workspace is gitignored runtime state.
 */
export function workflowDocsDir(projectRoot: string, workflowId: string, workflowRunId: string): string {
  return join(projectRoot, 'docs', 'vectalon', workflowId, workflowRunId)
}

export function writeWorkflowDocuments(
  projectRoot: string,
  workflowId: string,
  workflowRunId: string,
  documents: DocumentEntry[]
): string[] {
  const docsDir = workflowDocsDir(projectRoot, workflowId, workflowRunId)
  mkdirSync(docsDir, { recursive: true })

  const written: string[] = []
  for (const doc of documents) {
    const fileName = `${doc.phase.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
    const filePath = join(docsDir, fileName)
    const header = `# ${doc.title}\n\n`
    writeFileSync(filePath, header + doc.content)
    written.push(filePath)
  }

  return written
}

export function writePhaseDocument(
  projectRoot: string,
  workflowId: string,
  workflowRunId: string,
  phase: string,
  title: string,
  content: string
): string {
  const docsDir = workflowDocsDir(projectRoot, workflowId, workflowRunId)
  mkdirSync(docsDir, { recursive: true })

  const fileName = `${phase.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
  const filePath = join(docsDir, fileName)
  const header = `# ${title}\n\n`
  writeFileSync(filePath, header + content)
  return filePath
}
