import type { Permission, Server } from '@hako/shared'

export function can(server: Server, permission: Permission | 'manage'): boolean {
  if (permission === 'manage') return server.access.manage
  return server.access.manage || server.access.permissions.includes(permission)
}
