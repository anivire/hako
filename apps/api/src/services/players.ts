import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { type PlayerEntry, type PlayerList, type PlayerRecord, parseProperties } from '@hako/shared'
import { HTTPException } from 'hono/http-exception'
import { env } from '../env'
import { badRequest, notFound } from '../lib/http'
import { instance, statusOf } from '../runtime/instances'
import { resolveInside } from './files'

const NAME = /^[A-Za-z0-9_]{1,16}$/

const LISTS: Record<PlayerList, { file: string; add: (name: string) => string; remove: (name: string) => string }> = {
  ops: { file: 'ops.json', add: (n) => `op ${n}`, remove: (n) => `deop ${n}` },
  whitelist: { file: 'whitelist.json', add: (n) => `whitelist add ${n}`, remove: (n) => `whitelist remove ${n}` },
  bans: { file: 'banned-players.json', add: (n) => `ban ${n}`, remove: (n) => `pardon ${n}` },
}

type Raw = Record<string, unknown> & { uuid?: string; name?: string }

export function offlineUuid(name: string): string {
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  bytes[6] = (bytes[6]! & 0x0f) | 0x30
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  return dashed(bytes.toString('hex'))
}

function dashed(hex: string) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function readJson(serverId: string, file: string): Promise<Raw[]> {
  const text = await fs.readFile(await resolveInside(serverId, file, false), 'utf8').catch(() => '[]')
  try {
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as Raw[]) : []
  } catch {
    return []
  }
}

async function onlineMode(serverId: string): Promise<boolean> {
  const text = await fs.readFile(await resolveInside(serverId, 'server.properties', false), 'utf8').catch(() => '')
  return parseProperties(text)['online-mode'] !== 'false'
}

async function lookup(serverId: string, name: string): Promise<{ uuid: string; name: string }> {
  if (!(await onlineMode(serverId))) return { uuid: offlineUuid(name), name }
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, { headers: { 'User-Agent': env.userAgent }, signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!res) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
  if (res.status === 404 || res.status === 204) notFound('PLAYER_NOT_FOUND')
  if (!res.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
  const body = (await res.json()) as { id: string; name: string }
  return { uuid: dashed(body.id), name: body.name }
}

function stamp() {
  return `${new Date().toISOString().replace('T', ' ').slice(0, 19)} +0000`
}

function list(kind: string) {
  const found = LISTS[kind as PlayerList]
  if (!found) notFound('PATH_NOT_FOUND')
  return found
}

export async function readPlayers(serverId: string, kind: string): Promise<PlayerEntry[]> {
  const rows = await readJson(serverId, list(kind).file)
  return rows.filter((r) => typeof r.name === 'string').map((r) => ({ name: r.name!, uuid: typeof r.uuid === 'string' ? r.uuid : null, reason: typeof r.reason === 'string' ? r.reason : null, level: typeof r.level === 'number' ? r.level : null }))
}

export async function addPlayer(serverId: string, kind: string, name: string): Promise<{ via: 'console' | 'file' }> {
  const spec = list(kind)
  if (!NAME.test(name)) badRequest('PLAYER_NAME_INVALID')
  if (statusOf(serverId) !== 'offline' && instance(serverId).command(spec.add(name))) return { via: 'console' }
  const player = await lookup(serverId, name)
  const rows = (await readJson(serverId, spec.file)).filter((r) => r.uuid !== player.uuid && r.name?.toLowerCase() !== player.name.toLowerCase())
  const entry: Raw =
    kind === 'ops'
      ? { uuid: player.uuid, name: player.name, level: 4, bypassesPlayerLimit: false }
      : kind === 'bans'
        ? { uuid: player.uuid, name: player.name, created: stamp(), source: 'hako', expires: 'forever', reason: 'Banned by an operator.' }
        : { uuid: player.uuid, name: player.name }
  await fs.writeFile(await resolveInside(serverId, spec.file, false), `${JSON.stringify([...rows, entry], null, 2)}\n`)
  return { via: 'file' }
}

export async function removePlayer(serverId: string, kind: string, name: string): Promise<{ via: 'console' | 'file' }> {
  const spec = list(kind)
  if (!NAME.test(name)) badRequest('PLAYER_NAME_INVALID')
  if (statusOf(serverId) !== 'offline' && instance(serverId).command(spec.remove(name))) return { via: 'console' }
  const rows = await readJson(serverId, spec.file)
  await fs.writeFile(await resolveInside(serverId, spec.file, false), `${JSON.stringify(rows.filter((r) => r.name?.toLowerCase() !== name.toLowerCase()), null, 2)}\n`)
  return { via: 'file' }
}

export async function roster(serverId: string): Promise<PlayerRecord[]> {
  const [cache, ops, bans, whitelist] = await Promise.all(['usercache.json', LISTS.ops.file, LISTS.bans.file, LISTS.whitelist.file].map((f) => readJson(serverId, f)))
  const byName = new Map<string, PlayerRecord>()
  const mark = (rows: Raw[], flag?: 'op' | 'banned' | 'allowed') => {
    for (const r of rows) {
      if (typeof r.name !== 'string' || !NAME.test(r.name)) continue
      const key = r.name.toLowerCase()
      const record = byName.get(key) ?? { name: r.name, uuid: null, op: false, banned: false, allowed: false }
      record.uuid ??= typeof r.uuid === 'string' ? r.uuid : null
      if (flag) record[flag] = true
      byName.set(key, record)
    }
  }
  mark(cache!)
  mark(ops!, 'op')
  mark(bans!, 'banned')
  mark(whitelist!, 'allowed')
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function kickPlayer(serverId: string, name: string) {
  if (!NAME.test(name)) badRequest('PLAYER_NAME_INVALID')
  if (statusOf(serverId) === 'offline' || !instance(serverId).command(`kick ${name}`)) badRequest('SERVER_OFFLINE')
}
