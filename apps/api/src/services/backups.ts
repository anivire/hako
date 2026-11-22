import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import * as tar from 'tar'
import type { Backup, BackupsOverview, GameTemplate } from '@hako/shared'
import { env } from '../env'
import { serverGame } from '../games/registry'
import { badRequest, notFound } from '../lib/http'
import { type ServerRow, instance, serverDir, statusOf } from '../runtime/instances'

const NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(-\d+)?\.tar\.gz$/
const busy = new Set<string>()

export function backupBusy(id: string) {
  return busy.has(id)
}

function backupFolder(id: string) {
  return path.join(env.backupsDir, id)
}

export function backupFile(id: string, name: string) {
  if (!NAME.test(name)) badRequest('PATH_INVALID')
  return path.join(backupFolder(id), name)
}

function excluded(game: GameTemplate) {
  return new Set([...game.backup.exclude, ...game.volumes.map((v) => v.folder)])
}

export async function listBackups(id: string): Promise<Backup[]> {
  const names = await fs.readdir(backupFolder(id)).catch(() => [] as string[])
  const out = await Promise.all(
    names.filter((n) => NAME.test(n)).map(async (name) => {
      const stat = await fs.stat(path.join(backupFolder(id), name)).catch(() => null)
      return stat ? { name, size: stat.size, createdAt: stat.mtime.toISOString() } : null
    }),
  )
  return out.filter((b): b is Backup => b !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.length - a.name.length || b.name.localeCompare(a.name))
}

export async function backupsOverview(server: ServerRow): Promise<BackupsOverview> {
  return { backups: await listBackups(server.id), limit: server.backupLimit, running: busy.has(server.id) }
}

async function prune(id: string, limit: number) {
  for (const old of (await listBackups(id)).slice(limit)) await fs.rm(path.join(backupFolder(id), old.name), { force: true })
}

export async function pruneBackups(server: ServerRow) {
  await prune(server.id, server.backupLimit)
}

function claim(id: string) {
  if (busy.has(id)) badRequest('BACKUP_RUNNING')
  busy.add(id)
}

export async function createBackup(server: ServerRow): Promise<Backup> {
  const game = serverGame(server)
  if (!game) badRequest('GAME_UNKNOWN')
  claim(server.id)
  const target = instance(server.id)
  const online = statusOf(server.id) === 'running'
  try {
    const folder = backupFolder(server.id)
    await fs.mkdir(folder, { recursive: true })
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-')
    let name = `${stamp}.tar.gz`
    for (let i = 1; await fs.stat(path.join(folder, name)).then(() => true, () => false); i++) name = `${stamp}-${i}.tar.gz`
    const skip = excluded(game)
    if (online && game.backup.before.length) {
      for (const command of game.backup.before) target.command(command)
      await sleep(game.backup.wait * 1000)
    }
    const part = path.join(folder, `.${name}.part`)
    try {
      await fs.mkdir(serverDir(server.id), { recursive: true })
      await tar.create({ gzip: true, file: part, cwd: serverDir(server.id), portable: true, filter: (p) => !skip.has(p.replace(/^\.\//, '').split('/')[0]!) }, ['.'])
      await fs.rename(part, path.join(folder, name))
    } catch (e) {
      await fs.rm(part, { force: true })
      throw e
    } finally {
      if (online) for (const command of game.backup.after) target.command(command)
    }
    await prune(server.id, server.backupLimit)
    const stat = await fs.stat(path.join(folder, name))
    target.notice(`backup ${name} created (${Math.round(stat.size / 1024 / 1024)} MB)`)
    return { name, size: stat.size, createdAt: stat.mtime.toISOString() }
  } catch (e) {
    target.notice(`backup failed: ${e instanceof Error ? e.message : e}`)
    throw e
  } finally {
    busy.delete(server.id)
  }
}

export async function restoreBackup(server: ServerRow, name: string) {
  const file = backupFile(server.id, name)
  await fs.stat(file).catch(() => notFound('PATH_NOT_FOUND'))
  const game = serverGame(server)
  if (!game) badRequest('GAME_UNKNOWN')
  if (statusOf(server.id) !== 'offline') badRequest('SERVER_RUNNING')
  claim(server.id)
  try {
    const dir = serverDir(server.id)
    await fs.mkdir(dir, { recursive: true })
    const skip = excluded(game)
    for (const entry of await fs.readdir(dir)) if (!skip.has(entry)) await fs.rm(path.join(dir, entry), { recursive: true, force: true })
    await tar.extract({ file, cwd: dir, strict: true })
    instance(server.id).notice(`backup ${name} restored`)
  } finally {
    busy.delete(server.id)
  }
}

export async function removeBackups(id: string) {
  await fs.rm(backupFolder(id), { recursive: true, force: true })
}
