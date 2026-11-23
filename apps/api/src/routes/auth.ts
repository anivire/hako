import { and, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { type InviteInfo, type Permission, type SessionInfo, changePasswordSchema, localeSchema, loginSchema, registerSchema } from '@hako/shared'
import { db, now } from '../db/client'
import { serverMembers, servers, sessions, users } from '../db/schema'
import { findUsableInvite } from '../services/invites'
import { markInviteUsed, upsertMember } from '../services/members'
import { type AppEnv, checkLoginRate, createSession, currentSessionId, destroySession, requireAuth, resetLoginRate, sessionUser, toUser } from '../lib/auth'
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
  .get('/sessions', requireAuth, (c) => {
    const current = currentSessionId(c)
    const rows = db.select().from(sessions).where(eq(sessions.userId, c.get('user').id)).orderBy(sessions.createdAt).all()
    return c.json(rows.map((s) => ({ id: s.id, userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt, current: s.id === current }) satisfies SessionInfo).sort((a, b) => Number(b.current) - Number(a.current)))
  })
  .delete('/sessions/:id', requireAuth, (c) => {
    const id = c.req.param('id')
    if (id === currentSessionId(c)) {
      destroySession(c)
      return c.json({ signedOut: true })
    }
    db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, c.get('user').id))).run()
    return c.json({ signedOut: false })
  })
  .delete('/sessions', requireAuth, (c) => {
    db.delete(sessions).where(and(eq(sessions.userId, c.get('user').id), ne(sessions.id, currentSessionId(c) ?? ''))).run()
    return c.json({ ok: true })
  })
  .post('/password', requireAuth, async (c) => {
    const input = await parseBody(c, changePasswordSchema)
    const user = c.get('user')
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw new HTTPException(400, { message: 'INVALID_PASSWORD' })
    db.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, user.id)).run()
    db.delete(sessions).where(eq(sessions.userId, user.id)).run()
    createSession(c, user.id)
    return c.json({ ok: true })
  })
  .patch('/locale', requireAuth, async (c) => {
    const { locale } = await parseBody(c, localeSchema)
    const user = db.update(users).set({ locale }).where(eq(users.id, c.get('user').id)).returning().get()
    return c.json(toUser(user))
  })
