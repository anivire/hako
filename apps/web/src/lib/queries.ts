import { QueryClient, useQuery } from '@tanstack/react-query'
import type { User } from '@hako/shared'
import type { TFunction } from 'i18next'
import { ApiError, api } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

export const keys = {
  me: ['me'] as const,
  games: ['games'] as const,
  servers: ['servers'] as const,
  server: (id: string) => ['servers', id] as const,
  files: (id: string, path: string) => ['files', id, path] as const,
  file: (id: string, path: string) => ['file', id, path] as const,
  addons: (id: string) => ['addons', id] as const,
  backups: (id: string) => ['backups', id] as const,
  schedules: (id: string) => ['schedules', id] as const,
  worlds: (id: string) => ['worlds', id] as const,
  addonSearch: (id: string, source: string, q: string) => ['addon-search', id, source, q] as const,
  users: ['users'] as const,
  invites: ['invites'] as const,
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.me()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
  })
}

export function useUser(): User {
  const { data } = useMe()
  if (!data) throw new Error('useUser outside of auth gate')
  return data
}

export function useGames() {
  return useQuery({ queryKey: keys.games, queryFn: api.games, staleTime: Infinity })
}

export function errorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof Error)) return t('common.error')
  const [code, detail] = error.message.split(':')
  const map: Record<string, string> = {
    INVALID_CREDENTIALS: 'auth.invalid',
    INVITE_INVALID: 'auth.inviteInvalid',
    USERNAME_TAKEN: 'auth.usernameTaken',
    TOO_MANY_ATTEMPTS: 'auth.tooMany',
    VARIABLE_INVALID: 'errors.variable',
    PORT_TAKEN: 'errors.portTaken',
    MEMORY_TOO_LOW: 'errors.memoryLow',
    MEMORY_TOO_HIGH: 'errors.memoryHigh',
    CPU_TOO_HIGH: 'errors.cpuHigh',
    GAME_UNKNOWN: 'errors.gameUnknown',
    SERVER_OFFLINE: 'errors.offline',
    SERVER_RUNNING: 'errors.running',
    BACKUP_RUNNING: 'errors.backupRunning',
    SCHEDULE_RUNNING: 'errors.scheduleRunning',
    SCHEDULE_NOT_FOUND: 'errors.scheduleNotFound',
    WORLD_NAME_INVALID: 'errors.worldName',
    WORLD_IS_CURRENT: 'errors.worldCurrent',
    WORLD_ARCHIVE_INVALID: 'errors.worldArchive',
    WORLDS_UNSUPPORTED: 'errors.worldsUnsupported',
    IMAGE_PULLING: 'errors.imagePulling',
    PATH_INVALID: 'errors.path',
    PATH_NOT_FOUND: 'errors.path',
    PATH_EXISTS: 'errors.pathExists',
    PLAYER_NOT_FOUND: 'errors.playerNotFound',
    PLAYER_NAME_INVALID: 'errors.playerName',
    FILE_TOO_LARGE: 'errors.fileTooLarge',
    FILE_BINARY: 'errors.fileBinary',
    MAP_UNSUPPORTED: 'errors.mapUnsupported',
    NOT_A_FILE: 'errors.path',
    MODPACK_LINKED: 'errors.modpackLinked',
    MODPACK_NOT_LINKED: 'errors.modpackLinked',
    MODPACK_UNKNOWN: 'errors.modpackUnknown',
    ADDONS_UNSUPPORTED: 'errors.addonsUnsupported',
    ADDON_NO_VERSION: 'errors.addonNoVersion',
    ADDON_DOWNLOAD_FAILED: 'errors.addonDownload',
    ADDON_TOO_LARGE: 'errors.fileTooLarge',
    UPSTREAM_FAILED: 'errors.upstream',
    USER_HAS_SERVERS: 'errors.userHasServers',
    CANNOT_DELETE_SELF: 'errors.deleteSelf',
    CANNOT_CHANGE_SELF: 'errors.changeSelf',
    MEMBER_IS_OWNER: 'errors.memberOwner',
    USER_NOT_FOUND: 'errors.userNotFound',
    FORBIDDEN: 'errors.forbidden',
    CURSEFORGE_KEY_MISSING: 'errors.curseforgeKeyMissing',
    CURSEFORGE_KEY_INVALID: 'errors.curseforgeKeyInvalid',
  }
  const key = code ? map[code] : undefined
  return key ? t(key, { detail }) : error.message || t('common.error')
}
