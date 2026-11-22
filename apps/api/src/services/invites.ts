import { and, desc, eq, inArray } from 'drizzle-orm'
import { type Invite, PERMISSIONS, type Permission } from '@hako/shared'
import { db, now } from '../db/client'
import { invites, servers, users } from '../db/schema'
import { randomToken } from '../lib/crypto'

type InviteRow = typeof invites.$inferSelect

export function inviteUsable(row: InviteRow): boolean {
  if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) return false
  return row.multiUse || !row.usedAt
}

export function findUsableInvite(code: string): InviteRow | undefined {
  const row = db.select().from(invites).where(eq(invites.code, code)).get()
  return row && inviteUsable(row) ? row : undefined
}

function permissionsOf(value: unknown): Permission[] | null {
  return Array.isArray(value) ? value.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)) : null
}

export function listInvites(filter: { serverId?: string; global?: boolean }): Invite[] {
  const where = filter.serverId ? eq(invites.serverId, filter.serverId) : undefined
  const rows = db.select().from(invites).where(where).orderBy(desc(invites.id)).all()
  const ids = rows.map((r) => r.id)
  const joined = ids.length ? db.select({ inviteId: users.inviteId, username: users.username }).from(users).where(inArray(users.inviteId, ids)).all() : []
  const usedByIds = rows.map((r) => r.usedBy).filter((id): id is number => id !== null)
  const usedBy = usedByIds.length ? new Map(db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, usedByIds)).all().map((u) => [u.id, u.username])) : new Map<number, string>()
  const serverIds = [...new Set(rows.map((r) => r.serverId).filter((id): id is string => Boolean(id)))]
  const names = serverIds.length ? new Map(db.select({ id: servers.id, name: servers.name }).from(servers).where(inArray(servers.id, serverIds)).all().map((s) => [s.id, s.name])) : new Map<string, string>()
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    role: row.role,
    note: row.note,
    expiresAt: row.expiresAt,
    multiUse: row.multiUse,
    uses: row.uses,
    usedAt: row.usedAt,
    usedBy: row.usedBy !== null ? (usedBy.get(row.usedBy) ?? null) : null,
    joined: joined.filter((j) => j.inviteId === row.id).map((j) => j.username),
    serverId: row.serverId,
    serverName: row.serverId ? (names.get(row.serverId) ?? null) : null,
    permissions: permissionsOf(row.permissions),
    createdAt: row.createdAt,
  }))
}

export function createInvite(input: { role: 'admin' | 'user'; note?: string | null; days?: number | null; multiUse: boolean; serverId?: string; permissions?: Permission[]; createdBy: number }) {
  return db
    .insert(invites)
    .values({
      code: randomToken(12),
      role: input.role,
      note: input.note || null,
      expiresAt: input.days ? new Date(Date.now() + input.days * 86_400_000).toISOString() : null,
      multiUse: input.multiUse,
      serverId: input.serverId ?? null,
      permissions: input.permissions ?? null,
      createdBy: input.createdBy,
      createdAt: now(),
    })
    .returning()
    .get()
}

export function deleteInvite(id: number, serverId?: string) {
  db.delete(invites)
    .where(serverId ? and(eq(invites.id, id), eq(invites.serverId, serverId)) : eq(invites.id, id))
    .run()
}
