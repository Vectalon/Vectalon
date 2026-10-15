import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'

export interface LocalModelArtifact {
  sha256: string
  sizeBytes: number
  source: 'local-file-at-load'
}

export async function modelFileStamp(path: string): Promise<string> {
  const value = await stat(path, { bigint: true })
  if (!value.isFile() || value.size === 0n) throw new Error('Model artifact must be a non-empty file')
  return [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':')
}

/** File observation, not native-memory attestation; reject ordinary concurrent replacement. */
export async function fingerprintModelFile(path: string): Promise<{ artifact: LocalModelArtifact; stamp: string }> {
  const stamp = await modelFileStamp(path)
  const hash = createHash('sha256')
  let sizeBytes = 0
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
    sizeBytes += chunk.length
  }
  if (await modelFileStamp(path) !== stamp) throw new Error('Model artifact changed while fingerprinting; restart inference')
  return { artifact: { sha256: hash.digest('hex'), sizeBytes, source: 'local-file-at-load' }, stamp }
}
