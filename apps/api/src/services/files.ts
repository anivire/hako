import fs from 'node:fs/promises'
import path from 'node:path'
import type { FileEntry } from '@hako/shared'
import { badRequest, notFound } from '../lib/http'
import { serverDir } from '../runtime/instances'

export const MAX_EDIT_BYTES = 2 * 1024 * 1024

export async function resolveInside(serverId: string, relative: string, allowRoot = true): Promise<string> {
  const root = serverDir(serverId)
  await fs.mkdir(root, { recursive: true })
  const realRoot = await fs.realpath(root)
  const target = path.resolve(realRoot, `.${path.sep}${relative.replace(/\\/g, '/')}`)
  if (target === realRoot ? !allowRoot : !target.startsWith(realRoot + path.sep)) badRequest('PATH_INVALID')
  let existing = target
  while (true) {
    try {
      const real = await fs.realpath(existing)
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) badRequest('PATH_INVALID')
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      existing = path.dirname(existing)
    }
  }
  return target
}

export async function listDir(serverId: string, relative: string): Promise<FileEntry[]> {
  const dir = await resolveInside(serverId, relative)
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    notFound('PATH_NOT_FOUND')
  }
  const out = await Promise.all(
    entries.map(async (e) => {
      const stat = await fs.stat(path.join(dir, e.name)).catch(() => null)
      return { name: e.name, dir: stat?.isDirectory() ?? e.isDirectory(), size: stat?.size ?? 0, modifiedAt: stat?.mtime.toISOString() ?? new Date(0).toISOString() }
    }),
  )
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

export async function readText(serverId: string, relative: string): Promise<string> {
  const file = await resolveInside(serverId, relative)
  const stat = await fs.stat(file).catch(() => notFound('PATH_NOT_FOUND'))
  if (!stat.isFile()) badRequest('NOT_A_FILE')
  if (stat.size > MAX_EDIT_BYTES) badRequest('FILE_TOO_LARGE')
  return fs.readFile(file, 'utf8')
}

export async function writeFile(serverId: string, relative: string, data: string | Uint8Array) {
  const file = await resolveInside(serverId, relative, false)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, data)
}

export async function makeDir(serverId: string, relative: string) {
  await fs.mkdir(await resolveInside(serverId, relative), { recursive: true })
}

export async function removePath(serverId: string, relative: string) {
  const target = await resolveInside(serverId, relative, false)
  await fs.rm(target, { recursive: true, force: true })
}

export async function movePath(serverId: string, from: string, to: string) {
  const source = await resolveInside(serverId, from, false)
  const target = await resolveInside(serverId, to, false)
  if (target === source || target.startsWith(source + path.sep)) badRequest('PATH_INVALID')
  await fs.stat(source).catch(() => notFound('PATH_NOT_FOUND'))
  if (await fs.stat(target).then(() => true, () => false)) badRequest('PATH_EXISTS')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.rename(source, target)
}
