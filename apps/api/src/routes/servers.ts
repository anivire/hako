import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { upgradeWebSocket } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type Member, type Permission, type PortCheck, type QuickStats, type Server, type ServerAccess, backupLimitSchema, memberSchema, scheduleSchema, serverInviteCreateSchema, addonInstallSchema, addonToggleSchema, addonUpdateSchema, powerSchema, serverCreateSchema, serverUpdateSchema } from '@hako/shared'
import { addonKind, addonSource, modpackStatus, addonUpdates, addonsOverview, installAddon, modpackBase, removeAddon, setAddonEnabled, updateAddons } from '../addons/manager'
import { accessOf, allows, requiredPermission } from '../lib/access'
import { db, now } from '../db/client'
import { createInvite, deleteInvite, listInvites } from '../services/invites'
import { removeMember, upsertMember } from '../services/members'
import { env } from '../env'
import { serverMembers, servers, users } from '../db/schema'
import { interpolate, listGames, requireGame, resolveVariables } from '../games/registry'
import { optionSource } from '../options'
import { type AppEnv, requireAuth } from '../lib/auth'
import { badRequest, notFound } from '../lib/http'
import { parseBody } from '../lib/validate'
import { type ServerRow, dockerPublishedPorts, dockerResources, hostPortFree, instance, quickStats, runningCommand, serverDir, serverPorts, startedAtOf, statusOf, versionOf } from '../runtime/instances'
import { addPlayer, kickPlayer, readPlayers, removePlayer, roster } from '../services/players'
import { diskUsage } from '../services/usage'
import { deleteWorld, downloadWorld, listWorlds, selectWorld, uploadWorld } from '../services/worlds'
import { updateImage, updatesOf } from '../services/updates'
import { createSchedule, deleteSchedule, listSchedules, runScheduleNow, updateSchedule } from '../services/schedules'
import { backupBusy, backupFile, backupsOverview, createBackup, pruneBackups, removeBackups, restoreBackup } from '../services/backups'
import { proxyMap, setMap, setMapShare, sharedServer } from '../services/map'
import { MAX_EDIT_BYTES, listDir, makeDir, movePath, readText, removePath, resolveInside, writeFile } from '../services/files'

type ServerEnv = AppEnv & { Variables: { server: ServerRow; access: ServerAccess } }

const MAX_UPLOAD = 512 * 1024 * 1024
const MAX_ICON = 5 * 1024 * 1024
const ICON_HOSTS = new Set(['cdn.modrinth.com', 'gcdn.thunderstore.io', 'ccdn.thunderstore.io', 'images.steamusercontent.com', 'steamuserimages-a.akamaihd.net', 'mc-heads.net', 'minotar.net', 'media.forgecdn.net'])

function iconUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    badRequest('PATH_INVALID')
  }
  if (url.protocol !== 'https:' || !ICON_HOSTS.has(url.hostname)) badRequest('PATH_INVALID')
  if (url.hostname === 'images.steamusercontent.com') for (const [k, v] of Object.entries({ imw: '128', imh: '128', ima: 'fit', impolicy: 'Letterbox' })) url.searchParams.set(k, v)
  return url
}

function toServer(row: ServerRow, access: ServerAccess): Server {
  const game = requireGame(row.game)
  return { id: row.id, name: row.name, game: row.game, memory: row.memory, cpu: row.cpu ?? null, icon: row.icon, variables: row.variables, ports: serverPorts(row, game), status: statusOf(row.id), startedAt: startedAtOf(row.id), version: versionOf(row.id), addons: addonKind(row), address: game.address ? interpolate(game.address, { ...Object.fromEntries(game.variables.map((v) => [v.key, v.default])), ...row.variables }).trim() || null : null, updates: updatesOf(row.id), access, ownerId: row.ownerId, createdAt: row.createdAt }
}

async function checkPorts(requested: Record<string, number>, game: ReturnType<typeof requireGame>): Promise<PortCheck[]> {
  const used = new Set([...db.select({ ports: servers.ports }).from(servers).all().flatMap((s) => Object.values(s.ports)), ...(await dockerPublishedPorts())])
  const busy = async (port: number, protocol: 'tcp' | 'udp') => used.has(port) || !(await hostPortFree(port, protocol))
  const out: PortCheck[] = []
  for (const p of game.ports) {
    const wanted = requested[p.name]
    const free = wanted === undefined ? true : !(await busy(wanted, p.protocol))
    let port = wanted !== undefined && free ? wanted : (wanted ?? p.container)
    while (port <= 65535 && (await busy(port, p.protocol))) port += 1
    if (port > 65535) badRequest('PORT_TAKEN')
    used.add(port)
    out.push({ name: p.name, protocol: p.protocol, requested: wanted ?? null, free, port })
  }
  return out
}

async function checkResources(memory?: number, cpu?: number | null) {
  const host = await dockerResources()
  if (memory !== undefined && host.memory && memory > host.memory) badRequest('MEMORY_TOO_HIGH')
  if (cpu && host.cpus && cpu > host.cpus) badRequest('CPU_TOO_HIGH')
}

async function allocatePorts(requested: Record<string, number>, game: ReturnType<typeof requireGame>): Promise<Record<string, number>> {
  const checks = await checkPorts(requested, game)
  if (checks.some((c) => !c.free)) badRequest('PORT_TAKEN')
  return Object.fromEntries(checks.map((c) => [c.name, c.port]))
}

const loadServer = createMiddleware<ServerEnv>(async (c, next) => {
  const id = c.req.param('id') ?? ''
  const row = db.select().from(servers).where(eq(servers.id, id)).get()
  const access = row ? accessOf(row, c.get('user')) : null
  if (!row || !access) notFound('SERVER_NOT_FOUND')
  const prefix = `/api/servers/${id}`
  const sub = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : ''
  if (!allows(access, requiredPermission(c.req.method, sub, row, c.req.query('path') ?? ''))) throw new HTTPException(403, { message: 'FORBIDDEN' })
  c.set('server', row)
  c.set('access', access)
  await next()
})

function members(serverId: string): Member[] {
  return db
    .select({ userId: serverMembers.userId, username: users.username, permissions: serverMembers.permissions, createdAt: serverMembers.createdAt })
    .from(serverMembers)
    .innerJoin(users, eq(users.id, serverMembers.userId))
    .where(eq(serverMembers.serverId, serverId))
    .orderBy(users.username)
    .all()
    .map((m) => ({ ...m, permissions: m.permissions as Permission[] }))
}

const pathQuery = (c: { req: { query: (k: string) => string | undefined } }) => {
  const value = c.req.query('path') ?? ''
  if (value.length > 1024 || value.includes('\0')) badRequest('PATH_INVALID')
  return value
}

export const gameRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', (c) => c.json(listGames()))
  .get('/:game/ports', async (c) => {
    const game = requireGame(c.req.param('game'))
    const requested: Record<string, number> = {}
    for (const p of game.ports) {
      const value = Number(c.req.query(p.name))
      if (Number.isInteger(value) && value >= 1 && value <= 65535) requested[p.name] = value
    }
    return c.json(await checkPorts(requested, game))
  })
  .get('/:game/options/:key', async (c) => {
    const game = requireGame(c.req.param('game'))
    const variable = game.variables.find((v) => v.key === c.req.param('key'))
    if (!variable?.source) notFound('OPTIONS_UNKNOWN')
    let vars: Record<string, string> = {}
    try {
      const parsed = JSON.parse(c.req.query('vars') ?? '{}') as unknown
      if (parsed && typeof parsed === 'object') vars = Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 256)]))
    } catch {}
    const params = Object.fromEntries(Object.entries(variable.source.params).map(([k, v]) => [k, interpolate(v, vars)]))
    return c.json(await optionSource(variable.source.id)(params, (c.req.query('q') ?? '').slice(0, 100)))
  })

export const serverRoutes = new Hono<ServerEnv>()
  .use(requireAuth)
  .get('/', (c) => {
    const user = c.get('user')
    const rows = db.select().from(servers).orderBy(servers.createdAt).all()
    return c.json(rows.flatMap((row) => {
      const access = accessOf(row, user)
      return access ? [toServer(row, access)] : []
    }))
  })
  .get('/stats', async (c) => {
    const user = c.get('user')
    const rows = db.select().from(servers).all().filter((row) => accessOf(row, user) && statusOf(row.id) === 'running')
    const entries = await Promise.all(rows.map(async (row) => [row.id, await quickStats(row.id, row.cpu ?? null)] as const))
    return c.json(Object.fromEntries(entries.flatMap(([id, s]) => (s ? [[id, { ...s, players: instance(id).playerCount } satisfies QuickStats]] : []))))
  })
  .post('/', async (c) => {
    const input = await parseBody(c, serverCreateSchema)
    const game = requireGame(input.game)
    if (input.memory < game.memory.min) badRequest('MEMORY_TOO_LOW')
    await checkResources(input.memory, input.cpu)
    const row = db
      .insert(servers)
      .values({ id: randomBytes(4).toString('hex'), name: input.name, game: game.id, memory: input.memory, cpu: input.cpu ?? null, icon: input.icon ?? null, variables: resolveVariables(game, input.variables), ports: await allocatePorts(input.ports, game), ownerId: c.get('user').id, createdAt: now() })
      .returning()
      .get()
    await fs.mkdir(serverDir(row.id), { recursive: true })
    return c.json(toServer(row, accessOf(row, c.get('user'))!))
  })
  .use('/:id/*', loadServer)
  .use('/:id', loadServer)
  .get('/:id', (c) => c.json(toServer(c.get('server'), c.get('access'))))
  .patch('/:id', async (c) => {
    const input = await parseBody(c, serverUpdateSchema)
    const server = c.get('server')
    const game = requireGame(server.game)
    if (input.memory !== undefined && input.memory < game.memory.min) badRequest('MEMORY_TOO_LOW')
    await checkResources(input.memory, input.cpu)
    const row = db
      .update(servers)
      .set({ name: input.name, memory: input.memory, cpu: input.cpu, icon: input.icon, variables: input.variables ? resolveVariables(game, input.variables, server.variables) : undefined })
      .where(eq(servers.id, server.id))
      .returning()
      .get()
    return c.json(toServer(row, c.get('access')))
  })
  .delete('/:id', async (c) => {
    const server = c.get('server')
    await instance(server.id).destroy()
    await fs.rm(serverDir(server.id), { recursive: true, force: true })
    await removeBackups(server.id)
    db.delete(servers).where(eq(servers.id, server.id)).run()
    return c.json({ ok: true })
  })
  .post('/:id/power', async (c) => {
    const { action } = await parseBody(c, powerSchema)
    const server = c.get('server')
    if ((action === 'start' || action === 'restart') && backupBusy(server.id)) badRequest('BACKUP_RUNNING')
    const run = instance(server.id).power(action, server)
    run.catch(() => {})
    return c.json({ ok: true })
  })
  .post('/:id/command', async (c) => {
    const { command } = await parseBody(c, z.object({ command: z.string().min(1).max(2000) }))
    if (!instance(c.get('server').id).command(command)) badRequest('SERVER_OFFLINE')
    return c.json({ ok: true })
  })
  .get(
    '/:id/ws',
    createMiddleware<ServerEnv>(async (c, next) => {
      const origin = c.req.header('origin')
      if (origin && new URL(origin).host !== c.req.header('host')) throw new HTTPException(403, { message: 'Forbidden' })
      await next()
    }),
    upgradeWebSocket((c) => {
      const server = c.get('server')
      const canConsole = allows(c.get('access'), 'console')
      let unsubscribe: (() => void) | null = null
      return {
        onOpen(_event, ws) {
          unsubscribe = instance(server.id).subscribe((message) => {
            if (!canConsole && (message.type === 'log' || message.type === 'history')) {
              if (message.type === 'history') ws.send(JSON.stringify({ type: 'history', data: '' }))
              return
            }
            ws.send(JSON.stringify(message))
          })
        },
        onMessage(event) {
          if (typeof event.data !== 'string' || event.data.length > 2000) return
          try {
            const message = JSON.parse(event.data) as { type?: string; command?: string }
            if (canConsole && message.type === 'command' && typeof message.command === 'string' && message.command.trim()) instance(server.id).command(message.command)
          } catch {}
        },
        onClose() {
          unsubscribe?.()
          unsubscribe = null
        },
      }
    }),
  )
  .get('/:id/members', (c) => c.json(members(c.get('server').id)))
  .put('/:id/members/:userId', async (c) => {
    const server = c.get('server')
    const userId = Number(c.req.param('userId'))
    const { permissions } = await parseBody(c, memberSchema)
    if (!Number.isInteger(userId) || !db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) notFound('USER_NOT_FOUND')
    if (userId === server.ownerId) badRequest('MEMBER_IS_OWNER')
    upsertMember(server.id, userId, permissions)
    return c.json(members(server.id))
  })
  .delete('/:id/members/:userId', (c) => {
    const server = c.get('server')
    removeMember(server.id, Number(c.req.param('userId')))
    return c.json(members(server.id))
  })
  .get('/:id/invites', (c) => c.json(listInvites({ serverId: c.get('server').id })))
  .post('/:id/invites', async (c) => {
    const server = c.get('server')
    const input = await parseBody(c, serverInviteCreateSchema)
    const row = createInvite({ role: 'user', ...input, serverId: server.id, createdBy: c.get('user').id })
    return c.json({ code: row.code, invites: listInvites({ serverId: server.id }) })
  })
  .delete('/:id/invites/:inviteId', (c) => {
    const server = c.get('server')
    deleteInvite(Number(c.req.param('inviteId')), server.id)
    return c.json(listInvites({ serverId: server.id }))
  })
  .get('/:id/process', async (c) => {
    const server = c.get('server')
    return c.json({ command: statusOf(server.id) === 'offline' ? null : await runningCommand(server.id) })
  })
  .get('/:id/usage', async (c) => c.json({ bytes: await diskUsage(c.get('server').id) }))
  .get('/:id/files', async (c) => c.json(await listDir(c.get('server').id, pathQuery(c))))
  .get('/:id/files/content', async (c) => c.json({ content: await readText(c.get('server').id, pathQuery(c)) }))
  .put('/:id/files/content', bodyLimit({ maxSize: MAX_EDIT_BYTES * 2, onError: () => badRequest('FILE_TOO_LARGE') }), async (c) => {
    const { content } = await parseBody(c, z.object({ content: z.string().max(MAX_EDIT_BYTES) }))
    await writeFile(c.get('server').id, pathQuery(c), content)
    return c.json({ ok: true })
  })
  .post('/:id/files/folder', async (c) => {
    await makeDir(c.get('server').id, pathQuery(c))
    return c.json({ ok: true })
  })
  .post('/:id/files/upload', bodyLimit({ maxSize: MAX_UPLOAD, onError: () => badRequest('FILE_TOO_LARGE') }), async (c) => {
    await writeFile(c.get('server').id, pathQuery(c), new Uint8Array(await c.req.arrayBuffer()))
    return c.json({ ok: true })
  })
  .post('/:id/files/move', async (c) => {
    const { to } = await parseBody(c, z.object({ to: z.string().min(1).max(4096) }))
    await movePath(c.get('server').id, pathQuery(c), to)
    return c.json({ ok: true })
  })
  .delete('/:id/files', async (c) => {
    await removePath(c.get('server').id, pathQuery(c))
    return c.json({ ok: true })
  })
  .get('/:id/files/download', async (c) => {
    const file = await resolveInside(c.get('server').id, pathQuery(c), false)
    const stat = await fs.stat(file).catch(() => notFound('PATH_NOT_FOUND'))
    if (!stat.isFile()) badRequest('NOT_A_FILE')
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(stat.size), 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}` },
    })
  })
  .get('/:id/backups', async (c) => c.json(await backupsOverview(c.get('server'))))
  .post('/:id/backups', (c) => {
    const server = c.get('server')
    if (backupBusy(server.id)) badRequest('BACKUP_RUNNING')
    createBackup(server).catch(() => {})
    return c.json({ ok: true })
  })
  .patch('/:id/backups', async (c) => {
    const { limit } = await parseBody(c, backupLimitSchema)
    const row = db.update(servers).set({ backupLimit: limit }).where(eq(servers.id, c.get('server').id)).returning().get()
    await pruneBackups(row)
    return c.json(await backupsOverview(row))
  })
  .post('/:id/backups/:name/restore', async (c) => {
    await restoreBackup(c.get('server'), c.req.param('name'))
    return c.json({ ok: true })
  })
  .delete('/:id/backups/:name', async (c) => {
    await fs.rm(backupFile(c.get('server').id, c.req.param('name')), { force: true })
    return c.json(await backupsOverview(c.get('server')))
  })
  .get('/:id/backups/:name/download', async (c) => {
    const file = backupFile(c.get('server').id, c.req.param('name'))
    const stat = await fs.stat(file).catch(() => notFound('PATH_NOT_FOUND'))
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(stat.size), 'Content-Disposition': `attachment; filename="${c.get('server').id}-${path.basename(file)}"` },
    })
  })
  .post('/:id/updates/image', (c) => {
    updateImage(c.get('server'))
    return c.json({ ok: true })
  })
  .get('/:id/worlds', async (c) => c.json(await listWorlds(c.get('server'))))
  .put('/:id/worlds/current', async (c) => {
    const { name } = await parseBody(c, z.object({ name: z.string().trim().min(1).max(64) }))
    return c.json(await selectWorld(c.get('server'), name))
  })
  .post('/:id/worlds/upload', bodyLimit({ maxSize: MAX_UPLOAD, onError: () => badRequest('FILE_TOO_LARGE') }), async (c) => c.json(await uploadWorld(c.get('server'), (c.req.query('name') ?? '').slice(0, 200), new Uint8Array(await c.req.arrayBuffer()))))
  .get('/:id/worlds/:name/download', (c) => downloadWorld(c.get('server'), c.req.param('name')))
  .delete('/:id/worlds/:name', async (c) => c.json(await deleteWorld(c.get('server'), c.req.param('name'))))
  .get('/:id/schedules', (c) => c.json(listSchedules(c.get('server').id)))
  .post('/:id/schedules', async (c) => c.json(createSchedule(c.get('server').id, await parseBody(c, scheduleSchema))))
  .put('/:id/schedules/:sid', async (c) => c.json(updateSchedule(c.get('server').id, Number(c.req.param('sid')), await parseBody(c, scheduleSchema))))
  .delete('/:id/schedules/:sid', (c) => c.json(deleteSchedule(c.get('server').id, Number(c.req.param('sid')))))
  .post('/:id/schedules/:sid/run', (c) => c.json(runScheduleNow(c.get('server').id, Number(c.req.param('sid')))))
  .get('/:id/addons', async (c) => c.json(await addonsOverview(c.get('server'))))
  .get('/:id/addons/modpack', async (c) => c.json(await modpackStatus(c.get('server'))))
  .post('/:id/addons/unlink', async (c) => {
    const server = c.get('server')
    const game = requireGame(server.game)
    const variables = resolveVariables(game, { ...server.variables, ...(await modpackBase(server)) }, server.variables)
    const row = db.update(servers).set({ variables }).where(eq(servers.id, server.id)).returning().get()
    return c.json(toServer(row, c.get('access')))
  })
  .put('/:id/map', async (c) => {
    const { provider } = await parseBody(c, z.object({ provider: z.string().max(64).nullable() }))
    return c.json(toServer(await setMap(c.get('server'), provider), c.get('access')))
  })
  .post('/:id/map/share', async (c) => {
    const { on } = await parseBody(c, z.object({ on: z.boolean() }))
    return c.json(toServer(setMapShare(c.get('server'), on), c.get('access')))
  })
  .get('/:id/map', (c) => c.redirect(`${c.req.path}/`))
  .get('/:id/map/*', (c) => proxyMap(c.get('server'), c.req.path.slice(`/api/servers/${c.get('server').id}/map`.length), new URL(c.req.url).search, c.req.header('accept-language')))
  .get('/:id/players', async (c) => c.json(await roster(c.get('server'))))
  .post('/:id/players/kick', async (c) => {
    const { name } = await parseBody(c, z.object({ name: z.string().min(1).max(32) }))
    kickPlayer(c.get('server'), name)
    return c.json({ ok: true })
  })
  .get('/:id/players/:list', async (c) => c.json(await readPlayers(c.get('server'), c.req.param('list'))))
  .post('/:id/players/:list', async (c) => {
    const { name } = await parseBody(c, z.object({ name: z.string().min(1).max(32) }))
    return c.json(await addPlayer(c.get('server'), c.req.param('list'), name))
  })
  .delete('/:id/players/:list', async (c) => c.json(await removePlayer(c.get('server'), c.req.param('list'), c.req.query('name') ?? '')))
  .get('/:id/addons/icon', async (c) => {
    const res = await fetch(iconUrl(c.req.query('url') ?? ''), { headers: { 'User-Agent': env.userAgent }, redirect: 'error', signal: AbortSignal.timeout(15_000) }).catch(() => null)
    const type = res?.headers.get('content-type') ?? ''
    if (!res?.ok || !type.startsWith('image/') || Number(res.headers.get('content-length') ?? 0) > MAX_ICON) notFound('PATH_NOT_FOUND')
    const data = await res.arrayBuffer()
    if (data.byteLength > MAX_ICON) notFound('PATH_NOT_FOUND')
    return new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } })
  })
  .get('/:id/addons/updates', async (c) => c.json(await addonUpdates(c.get('server'))))
  .post('/:id/addons/update', async (c) => {
    const { paths } = await parseBody(c, addonUpdateSchema)
    return c.json({ updated: await updateAddons(c.get('server'), paths) })
  })
  .patch('/:id/addons', async (c) => {
    const { path: target, enabled } = await parseBody(c, addonToggleSchema)
    await setAddonEnabled(c.get('server'), target, enabled)
    return c.json({ ok: true })
  })
  .delete('/:id/addons', async (c) => {
    await removeAddon(c.get('server'), c.req.query('path') ?? '')
    return c.json({ ok: true })
  })
  .get('/:id/addons/:source/search', async (c) => {
    const { source, ctx } = await addonSource(c.get('server'), c.req.param('source'))
    const offset = Math.max(0, Math.min(10_000, Number(c.req.query('offset') ?? 0) || 0))
    return c.json(await source.search(ctx, (c.req.query('q') ?? '').slice(0, 200), offset))
  })
  .get('/:id/addons/:source/:project/versions', async (c) => {
    const { source, ctx } = await addonSource(c.get('server'), c.req.param('source'))
    return c.json(await source.versions(ctx, c.req.param('project')))
  })
  .post('/:id/addons', async (c) => {
    const input = await parseBody(c, addonInstallSchema)
    return c.json({ installed: await installAddon(c.get('server'), input.source, input.projectId, input.versionId) })
  })

export const shareRoutes = new Hono<AppEnv>()
  .get('/map/:token', (c) => c.redirect(`${c.req.path}/`))
  .get('/map/:token/*', (c) => {
    const token = c.req.param('token')
    return proxyMap(sharedServer(token), c.req.path.slice(`/api/share/map/${token}`.length), new URL(c.req.url).search, c.req.header('accept-language'))
  })
