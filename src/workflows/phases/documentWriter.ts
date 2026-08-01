import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface DocumentEntry {
  phase: string
  title: string
  content: string
}

export function writeWorkflowDocuments(
  projectRoot: string,
  workflowId: string,
  workflowRunId: string,
  documents: DocumentEntry[]
): string[] {
  const docsDir = join(projectRoot, '.vectalon', 'docs', workflowId, workflowRunId)
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
  const docsDir = join(projectRoot, '.vectalon', 'docs', workflowId, workflowRunId)
  mkdirSync(docsDir, { recursive: true })

  const fileName = `${phase.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
  const filePath = join(docsDir, fileName)
  const header = `# ${title}\n\n`
  writeFileSync(filePath, header + content)
  return filePath
}
