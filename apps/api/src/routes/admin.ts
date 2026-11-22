import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { type AdminUser, type ProviderId, type ProviderInfo, inviteCreateSchema, providerKeySchema, userRoleSchema } from '@hako/shared'
import { db } from '../db/client'
import { serverMembers, servers, users } from '../db/schema'
import { env } from '../env'
import { type AppEnv, requireAdmin, requireAuth, toUser } from '../lib/auth'
import { badRequest } from '../lib/http'
import { intParam, parseBody } from '../lib/validate'
import { createInvite, deleteInvite, listInvites } from '../services/invites'
import { curseforgeKey, getSetting, setSetting } from '../services/settings'

const PROVIDERS: { id: ProviderId; url: string; probe: string; needsKey?: boolean }[] = [
  { id: 'modrinth', url: 'https://modrinth.com', probe: 'https://api.modrinth.com/v2/tag/loader' },
  { id: 'curseforge', url: 'https://www.curseforge.com', probe: 'https://api.curseforge.com/v1/games/432', needsKey: true },
  { id: 'thunderstore', url: 'https://thunderstore.io', probe: 'https://thunderstore.io/api/experimental/package/denikson/BepInExPack_Valheim/' },
  { id: 'workshop', url: 'https://steamcommunity.com/workshop', probe: 'https://steamcommunity.com/workshop/browse/?appid=1281930' },
  { id: 'mojang', url: 'https://www.minecraft.net', probe: 'https://api.mojang.com/users/profiles/minecraft/Notch' },
]

async function reachable(provider: (typeof PROVIDERS)[number]): Promise<boolean> {
  const key = provider.needsKey ? curseforgeKey() : ''
  if (provider.needsKey && !key) return false
  const res = await fetch(provider.probe, { headers: { 'User-Agent': env.userAgent, ...(key ? { 'x-api-key': key } : {}) }, signal: AbortSignal.timeout(8000) }).catch(() => null)
  return Boolean(res && (provider.needsKey ? res.ok : res.status < 500))
}

async function providers(): Promise<ProviderInfo[]> {
  const checks = await Promise.all(PROVIDERS.map(reachable))
  return PROVIDERS.map((p, i) => ({
    id: p.id,
    url: p.url,
    needsKey: Boolean(p.needsKey),
    keySource: p.needsKey ? (getSetting('curseforgeApiKey') ? 'settings' : env.curseforgeApiKey ? 'env' : null) : null,
    reachable: checks[i]!,
  }))
}

function adminUsers(): AdminUser[] {
  const owned = new Map(db.select({ id: servers.ownerId, n: count() }).from(servers).groupBy(servers.ownerId).all().map((r) => [r.id, r.n]))
  const member = new Map(db.select({ id: serverMembers.userId, n: count() }).from(serverMembers).groupBy(serverMembers.userId).all().map((r) => [r.id, r.n]))
  return db
    .select()
    .from(users)
    .orderBy(users.id)
    .all()
    .map((u) => ({ ...toUser(u), servers: owned.get(u.id) ?? 0, memberships: member.get(u.id) ?? 0 }))
}

export const adminRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireAdmin)
  .get('/users', (c) => c.json(adminUsers()))
  .patch('/users/:id', async (c) => {
    const id = intParam(c, 'id')
    if (id === c.get('user').id) badRequest('CANNOT_CHANGE_SELF')
    const { role } = await parseBody(c, userRoleSchema)
    db.update(users).set({ role }).where(eq(users.id, id)).run()
    return c.json(adminUsers())
  })
  .delete('/users/:id', (c) => {
    const id = intParam(c, 'id')
    if (id === c.get('user').id) badRequest('CANNOT_DELETE_SELF')
    if (db.select({ id: servers.id }).from(servers).where(eq(servers.ownerId, id)).get()) badRequest('USER_HAS_SERVERS')
    db.delete(users).where(eq(users.id, id)).run()
    return c.json(adminUsers())
  })
  .get('/invites', (c) => c.json(listInvites({})))
  .post('/invites', async (c) => {
    const input = await parseBody(c, inviteCreateSchema)
    const row = createInvite({ ...input, createdBy: c.get('user').id })
    return c.json({ code: row.code, invites: listInvites({}) })
  })
  .delete('/invites/:id', (c) => {
    deleteInvite(intParam(c, 'id'))
    return c.json(listInvites({}))
  })
  .get('/providers', async (c) => c.json(await providers()))
  .put('/providers/curseforge', async (c) => {
    const { key } = await parseBody(c, providerKeySchema)
    setSetting('curseforgeApiKey', key)
    return c.json(await providers())
  })
