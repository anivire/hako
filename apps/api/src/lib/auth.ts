import { and, eq, gt, lt } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { getConnInfo } from '@hono/node-server/conninfo'
import { HTTPException } from 'hono/http-exception'
import type { User } from '@hako/shared'
import { db, now } from '../db/client'
import { sessions, users } from '../db/schema'
import { env, secureCookies } from '../env'
import { randomToken, sha256 } from './crypto'

export const SESSION_COOKIE = 'hako_session'

export type UserRow = typeof users.$inferSelect

export type AppEnv = {
  Variables: {
    user: UserRow
  }
}

export function toUser(row: UserRow): User {
  return { id: row.id, username: row.username, role: row.role, locale: row.locale, createdAt: row.createdAt }
}

export function clientIp(c: Context): string | null {
  const forwarded = c.req.header('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean)
  if (forwarded?.length) return forwarded[forwarded.length - 1]!
  const real = c.req.header('x-real-ip')
  if (real) return real
  try {
    return getConnInfo(c).remote.address ?? null
  } catch {
    return null
  }
}

export function createSession(c: Context, userId: number) {
  const token = randomToken()
  const expires = new Date(Date.now() + env.sessionDays * 86_400_000)
  db.insert(sessions).values({ id: sha256(token), userId, expiresAt: expires.toISOString(), createdAt: now() }).run()
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: secureCookies, path: '/', expires })
}

export function destroySession(c: Context) {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) db.delete(sessions).where(eq(sessions.id, sha256(token))).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export function purgeExpiredSessions() {
  db.delete(sessions).where(lt(sessions.expiresAt, now())).run()
}

export function sessionUser(c: Context): UserRow | null {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  const row = db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, now())))
    .get()
  return row?.user ?? null
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = sessionUser(c)
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' })
  c.set('user', user)
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') throw new HTTPException(403, { message: 'Forbidden' })
  await next()
})

const attempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_WINDOW_MS = 15 * 60_000
const ACCOUNT_LIMIT = 10
const IP_LIMIT = 30

function countAttempt(key: string, limit: number) {
  const t = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.resetAt < t) {
    attempts.set(key, { count: 1, resetAt: t + LOGIN_WINDOW_MS })
    return
  }
  entry.count += 1
  if (entry.count > limit) throw new HTTPException(429, { message: 'TOO_MANY_ATTEMPTS' })
}

function loginKeys(c: Context, username: string) {
  const ip = clientIp(c) ?? 'unknown'
  return { ip: `ip:${ip}`, account: `${ip}:${username.toLowerCase()}` }
}

export function checkLoginRate(c: Context, username: string) {
  const t = Date.now()
  for (const [key, entry] of attempts) if (entry.resetAt < t) attempts.delete(key)
  const keys = loginKeys(c, username)
  countAttempt(keys.ip, IP_LIMIT)
  countAttempt(keys.account, ACCOUNT_LIMIT)
}

export function resetLoginRate(c: Context, username: string) {
  attempts.delete(loginKeys(c, username).account)
}
