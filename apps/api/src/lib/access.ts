import { and, eq } from 'drizzle-orm'
import { PERMISSIONS, type Permission, type ServerAccess, resolveTemplate } from '@hako/shared'
import { db } from '../db/client'
import { serverMembers, servers } from '../db/schema'
import { getGame } from '../games/registry'
import type { UserRow } from './auth'

type ServerRow = typeof servers.$inferSelect

export function accessOf(server: ServerRow, user: UserRow): ServerAccess | null {
  if (user.role === 'admin' || server.ownerId === user.id) return { owner: server.ownerId === user.id, manage: true, permissions: [...PERMISSIONS] }
  const member = db
    .select()
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, server.id), eq(serverMembers.userId, user.id)))
    .get()
  if (!member) return null
  return { owner: false, manage: false, permissions: member.permissions.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)) }
}

function insideConfig(server: ServerRow, path: string): boolean {
  const game = getGame(server.game)
  if (!game) return false
  const clean = path.replace(/^\/+/, '')
  return resolveTemplate(game, server.variables).configs.some((c) => {
    if (c.format !== 'bepinex') return clean === c.path
    const rest = clean.startsWith(`${c.path}/`) ? clean.slice(c.path.length + 1) : null
    return clean === c.path || (rest !== null && !rest.includes('/') && rest.endsWith('.cfg'))
  })
}

export function requiredPermission(method: string, sub: string, server: ServerRow, path: string): Permission | 'manage' | null {
  const [first = '', second = ''] = sub.split('/').filter(Boolean)
  if (!first) return method === 'GET' ? null : method === 'DELETE' ? 'manage' : 'settings'
  switch (first) {
    case 'ws':
    case 'usage':
      return null
    case 'power':
      return 'power'
    case 'command':
      return 'console'
    case 'process':
      return 'settings'
    case 'files':
      if ((second === 'content' || second === '') && insideConfig(server, path)) return 'config'
      return 'files'
    case 'players':
      return 'config'
    case 'backups':
      return 'files'
    case 'map':
      return method === 'GET' ? null : 'settings'
    case 'addons':
      return second === 'icon' ? null : 'addons'
    case 'members':
    case 'invites':
      return 'manage'
    default:
      return 'manage'
  }
}

export function allows(access: ServerAccess, needed: Permission | 'manage' | null): boolean {
  if (!needed) return true
  if (needed === 'manage') return access.manage
  return access.manage || access.permissions.includes(needed) || (needed === 'config' && access.permissions.includes('files'))
}
