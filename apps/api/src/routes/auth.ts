import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { type InviteInfo, type Permission, localeSchema, loginSchema, registerSchema } from '@hako/shared'
import { db, now } from '../db/client'
import { serverMembers, servers, users } from '../db/schema'
import { findUsableInvite } from '../services/invites'
import { markInviteUsed, upsertMember } from '../services/members'
import { type AppEnv, checkLoginRate, createSession, destroySession, requireAuth, resetLoginRate, sessionUser, toUser } from '../lib/auth'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { parseBody } from '../lib/validate'

function inviteServer(serverId: string | null) {
  return serverId ? (db.select({ id: servers.id, name: servers.name }).from(servers).where(eq(servers.id, serverId)).get() ?? null) : null
}

export const authRoutes = new Hono<AppEnv>()
  .get('/me', (c) => {
    const user = sessionUser(c)
    if (!user) throw new HTTPException(401, { message: 'Unauthorized' })
    return c.json(toUser(user))
  })
  .post('/login', async (c) => {
    const { username, password } = await parseBody(c, loginSchema)
    checkLoginRate(c, username)
    const user = db.select().from(users).where(eq(users.username, username)).get()
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HTTPException(401, { message: 'INVALID_CREDENTIALS' })
    resetLoginRate(c, username)
    createSession(c, user.id)
    return c.json(toUser(user))
  })
  .post('/logout', (c) => {
    destroySession(c)
    return c.json({ ok: true })
  })
  .get('/invite/:code', (c) => {
    const invite = findUsableInvite(c.req.param('code'))
    return c.json({ valid: Boolean(invite), role: invite?.role ?? null, server: invite ? inviteServer(invite.serverId) : null } satisfies InviteInfo)
  })
  .post('/invite/:code/accept', requireAuth, (c) => {
    const invite = findUsableInvite(c.req.param('code'))
    if (!invite?.serverId) throw new HTTPException(400, { message: 'INVITE_INVALID' })
    const user = c.get('user')
    const current = db.select().from(serverMembers).where(and(eq(serverMembers.serverId, invite.serverId), eq(serverMembers.userId, user.id))).get()
    const permissions = [...new Set([...((current?.permissions ?? []) as Permission[]), ...((invite.permissions ?? []) as Permission[])])]
    db.transaction((tx) => {
      upsertMember(invite.serverId!, user.id, permissions, tx)
      markInviteUsed(invite.id, user.id, tx)
    })
    return c.json({ serverId: invite.serverId })
  })
  .post('/register', async (c) => {
    const input = await parseBody(c, registerSchema)
    const invite = findUsableInvite(input.code)
    if (!invite) throw new HTTPException(400, { message: 'INVITE_INVALID' })
    if (db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).get()) throw new HTTPException(409, { message: 'USERNAME_TAKEN' })
    const passwordHash = await hashPassword(input.password)
    const user = db.transaction((tx) => {
      const created = tx.insert(users).values({ username: input.username, passwordHash, role: invite.role, inviteId: invite.id, createdAt: now() }).returning().get()
      markInviteUsed(invite.id, created.id, tx)
      if (invite.serverId) upsertMember(invite.serverId, created.id, (invite.permissions ?? []) as Permission[], tx)
      return created
    })
    createSession(c, user.id)
    return c.json(toUser(user))
  })
  .patch('/locale', requireAuth, async (c) => {
    const { locale } = await parseBody(c, localeSchema)
    const user = db.update(users).set({ locale }).where(eq(users.id, c.get('user').id)).returning().get()
    return c.json(toUser(user))
  })
