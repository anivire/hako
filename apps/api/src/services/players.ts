import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { type ConfigFile, type PlayerEntry, type PlayerList, type PlayerRecord, parseIdList, parseJsonList, parseProperties, writeIdList, writeJsonList } from '@hako/shared'
import { HTTPException } from 'hono/http-exception'
import { env } from '../env'
import { badRequest, notFound } from '../lib/http'
import { serverGame } from '../games/registry'
import { type ServerRow, instance, statusOf } from '../runtime/instances'
import { resolveInside } from './files'

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

const KINDS: PlayerList[] = ['ops', 'whitelist', 'bans']

function specOf(server: ServerRow) {
  const game = serverGame(server)
  const players = game?.players
  if (!game || !players) notFound('PATH_NOT_FOUND')
  return { game, players, name: new RegExp(players.name ?? '^[^\s/\\]{1,32}$') }
}

function listOf(server: ServerRow, kind: string) {
  const { game, players, name } = specOf(server)
  const list = KINDS.includes(kind as PlayerList) ? players.lists[kind as PlayerList] : undefined
  if (!list) notFound('PATH_NOT_FOUND')
  return { ...list, file: list.config ? game.configs.find((c) => c.path === list.config) : undefined, name }
}

const fill = (command: string, name: string) => command.replaceAll('{{NAME}}', name)

function sent(server: ServerRow, command: string | undefined, name: string) {
  return Boolean(command) && statusOf(server.id) !== 'offline' && instance(server.id).command(fill(command!, name))
}

async function readList(server: ServerRow, file: ConfigFile | undefined): Promise<Raw[]> {
  if (!file) return []
  if (file.format === 'players') return readJson(server.id, file.path)
  const text = await fs.readFile(await resolveInside(server.id, file.path, false), 'utf8').catch(() => '')
  return (file.path.endsWith('.json') ? parseJsonList(text) : parseIdList(text)).map((name) => ({ name }))
}

async function writeList(server: ServerRow, file: ConfigFile, change: (names: string[]) => string[]) {
  const target = await resolveInside(server.id, file.path, false)
  const text = await fs.readFile(target, 'utf8').catch(() => '')
  const json = file.path.endsWith('.json')
  const names = change(json ? parseJsonList(text) : parseIdList(text))
  await fs.writeFile(target, json ? writeJsonList(text, names) : writeIdList(text, names))
}

export async function readPlayers(server: ServerRow, kind: string): Promise<PlayerEntry[]> {
  const rows = await readList(server, listOf(server, kind).file)
  return rows.filter((r) => typeof r.name === 'string').map((r) => ({ name: r.name!, uuid: typeof r.uuid === 'string' ? r.uuid : null, reason: typeof r.reason === 'string' ? r.reason : null, level: typeof r.level === 'number' ? r.level : null }))
}

export async function addPlayer(server: ServerRow, kind: string, name: string): Promise<{ via: 'console' | 'file' }> {
  const list = listOf(server, kind)
  if (!list.name.test(name)) badRequest('PLAYER_NAME_INVALID')
  if (sent(server, list.add, name)) return { via: 'console' }
  if (!list.file) badRequest('SERVER_OFFLINE')
  if (list.file.format !== 'players') {
    await writeList(server, list.file, (names) => (names.some((n) => n.toLowerCase() === name.toLowerCase()) ? names : [...names, name]))
    return { via: 'file' }
  }
  const player = await lookup(server.id, name)
  const rows = (await readJson(server.id, list.file.path)).filter((r) => r.uuid !== player.uuid && r.name?.toLowerCase() !== player.name.toLowerCase())
  const entry: Raw =
    kind === 'ops'
      ? { uuid: player.uuid, name: player.name, level: 4, bypassesPlayerLimit: false }
      : kind === 'bans'
        ? { uuid: player.uuid, name: player.name, created: stamp(), source: 'hako', expires: 'forever', reason: 'Banned by an operator.' }
        : { uuid: player.uuid, name: player.name }
  await fs.writeFile(await resolveInside(server.id, list.file.path, false), `${JSON.stringify([...rows, entry], null, 2)}\n`)
  return { via: 'file' }
}

export async function removePlayer(server: ServerRow, kind: string, name: string): Promise<{ via: 'console' | 'file' }> {
  const list = listOf(server, kind)
  if (!list.name.test(name)) badRequest('PLAYER_NAME_INVALID')
  if (sent(server, list.remove, name)) return { via: 'console' }
  if (!list.file) badRequest('SERVER_OFFLINE')
  if (list.file.format !== 'players') {
    await writeList(server, list.file, (names) => names.filter((n) => n.toLowerCase() !== name.toLowerCase()))
    return { via: 'file' }
  }
  const rows = await readJson(server.id, list.file.path)
  await fs.writeFile(await resolveInside(server.id, list.file.path, false), `${JSON.stringify(rows.filter((r) => r.name?.toLowerCase() !== name.toLowerCase()), null, 2)}\n`)
  return { via: 'file' }
}

const FLAG: Record<PlayerList, 'op' | 'allowed' | 'banned'> = { ops: 'op', whitelist: 'allowed', bans: 'banned' }

export async function roster(server: ServerRow): Promise<PlayerRecord[]> {
  const { game, players, name } = specOf(server)
  const byName = new Map<string, PlayerRecord>()
  const mark = (rows: Raw[], flag?: 'op' | 'banned' | 'allowed') => {
    for (const r of rows) {
      if (typeof r.name !== 'string' || !name.test(r.name)) continue
      const key = r.name.toLowerCase()
      const record = byName.get(key) ?? { name: r.name, uuid: null, op: false, banned: false, allowed: false }
      record.uuid ??= typeof r.uuid === 'string' ? r.uuid : null
      if (flag) record[flag] = true
      byName.set(key, record)
    }
  }
  if (players.known) mark(await readJson(server.id, players.known))
  for (const kind of KINDS) {
    const list = players.lists[kind]
    if (list?.config) mark(await readList(server, game.configs.find((c) => c.path === list.config)), FLAG[kind])
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function kickPlayer(server: ServerRow, player: string) {
  const { players, name } = specOf(server)
  if (!name.test(player)) badRequest('PLAYER_NAME_INVALID')
  if (!players.kick) notFound('PATH_NOT_FOUND')
  if (!sent(server, players.kick, player)) badRequest('SERVER_OFFLINE')
}

