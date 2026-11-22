import { and, eq, sql } from 'drizzle-orm'
import type { Permission } from '@hako/shared'
import { type DB, db, now } from '../db/client'
import { invites, serverMembers } from '../db/schema'

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

export function upsertMember(serverId: string, userId: number, permissions: Permission[], tx: Tx | DB = db) {
  tx.insert(serverMembers)
    .values({ serverId, userId, permissions, createdAt: now() })
    .onConflictDoUpdate({ target: [serverMembers.serverId, serverMembers.userId], set: { permissions } })
    .run()
}

export function removeMember(serverId: string, userId: number) {
  db.delete(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .run()
}

export function markInviteUsed(inviteId: number, userId: number, tx: Tx | DB = db) {
  tx.update(invites)
    .set({ uses: sql`${invites.uses} + 1`, usedAt: now(), usedBy: sql`coalesce(${invites.usedBy}, ${userId})` })
    .where(eq(invites.id, inviteId))
    .run()
}
