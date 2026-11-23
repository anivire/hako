import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../env'
import { serverDir } from '../runtime/instances'

const TTL = 30_000
const cache = new Map<string, { at: number; bytes: Promise<number> }>()

async function size(target: string): Promise<number> {
  let entries
  try {
    entries = await fs.readdir(target, { withFileTypes: true })
  } catch {
    return 0
  }
  let total = 0
  for (const entry of entries) {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) total += await size(full)
    else if (entry.isFile()) total += (await fs.stat(full).catch(() => null))?.size ?? 0
  }
  return total
}

export async function hostDisk(): Promise<{ total: number; free: number } | null> {
  try {
    const s = await fs.statfs(env.serversDir)
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }
  } catch {
    return null
  }
}

export function diskUsage(id: string): Promise<number> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL) return hit.bytes
  const bytes = size(serverDir(id))
  cache.set(id, { at: Date.now(), bytes })
  bytes.catch(() => cache.delete(id))
  return bytes
}
