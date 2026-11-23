import { z } from 'zod'
import { parseCron } from './cron'

export type Locale = 'ru' | 'en'

export const textSchema = z.union([z.string(), z.object({ ru: z.string().optional(), en: z.string().optional() })])
export type Text = z.infer<typeof textSchema>

export const configFieldSchema = z.object({
  key: z.string().min(1).max(128),
  name: textSchema,
  description: textSchema.optional(),
  type: z.enum(['string', 'number', 'boolean', 'select', 'motd']).default('string'),
  default: z.string().optional(),
  group: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: textSchema.optional() })).optional(),
})
export type ConfigField = z.infer<typeof configFieldSchema>

export const configFileSchema = z.object({
  path: z.string().min(1).max(256),
  format: z.enum(['properties', 'ini', 'json', 'bepinex', 'list', 'players']),
  list: z.enum(['ops', 'whitelist', 'bans']).optional(),
  description: textSchema.optional(),
  placeholder: textSchema.optional(),
  defaults: z.string().max(65536).optional(),
  seed: z.boolean().optional(),
  groups: z.array(z.object({ id: z.string(), name: textSchema, description: textSchema.optional() })).default([]),
  name: textSchema,
  fields: z.array(configFieldSchema).default([]),
})
export type ConfigFile = z.infer<typeof configFileSchema>

export const consoleSchema = z.object({ ready: z.string().optional(), exec: z.array(z.string().min(1)).min(1).optional(), version: z.string().optional(), players: z.object({ join: z.string(), leave: z.string() }).optional(), chat: z.object({ message: z.string(), command: z.string().optional(), server: z.string().optional(), say: z.string().optional() }).optional() })
export const stopSchema = z.object({ command: z.string().optional(), timeout: z.number().int().min(1).max(600).default(60) })
const playerListSchema = z.object({ config: z.string().optional(), add: z.string().optional(), remove: z.string().optional() })
export const playersSchema = z.object({
  name: z.string().optional(),
  avatar: z.string().optional(),
  known: z.string().optional(),
  kick: z.string().optional(),
  lists: z.object({ ops: playerListSchema.optional(), whitelist: playerListSchema.optional(), bans: playerListSchema.optional() }).default({}),
})
export type PlayersSpec = z.infer<typeof playersSchema>
const whenSchema = z.record(z.string(), z.array(z.string()))
export const fileRuleSchema = z.object({ path: z.string().min(1), when: whenSchema.optional(), create: z.string().optional(), content: z.string().optional(), replace: z.array(z.tuple([z.string(), z.string()])).default([]) })
export const mapProviderSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: textSchema,
  description: textSchema.optional(),
  icon: z.string().optional(),
  url: z.string().url().optional(),
  source: z.string().default('modrinth'),
  project: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  render: z.string().optional(),
  when: whenSchema.optional(),
  files: z.array(fileRuleSchema).default([]),
})
export type MapProvider = z.infer<typeof mapProviderSchema>
export const addonSourcesSchema = z.array(z.object({ source: z.string(), params: z.record(z.string(), z.string()).default({}) }))

export const volumesSchema = z.array(z.object({ path: z.string().startsWith('/'), folder: z.string().regex(/^[\w.-]+$/).refine((f) => f !== '.' && f !== '..') }))

export const backupSpecSchema = z.object({ before: z.array(z.string()).default([]), after: z.array(z.string()).default([]), wait: z.number().int().min(0).max(120).default(5), exclude: z.array(z.string().regex(/^[\w.-]+$/)).default([]) })

const worldPathSchema = z.string().min(1).max(256).refine((p) => !p.split('/').some((s) => s === '..' || s === ''), 'relative path')
export const worldsSchema = z.object({
  entry: worldPathSchema.refine((p) => p.split('/').filter((s) => s.includes('{{NAME}}')).length === 1, 'one {{NAME}} segment'),
  paths: z.array(worldPathSchema).min(1),
  variable: z.string().optional(),
  property: z.object({ config: z.string(), key: z.string(), default: z.string() }).optional(),
})
export type WorldsSpec = z.infer<typeof worldsSchema>

export interface World {
  name: string
  size: number
  modifiedAt: string | null
  current: boolean
}

export interface WorldsOverview {
  worlds: World[]
  current: string
  offline: boolean
}

export const templateOverrideSchema = z.object({
  image: z.string().min(1).optional(),
  command: z.array(z.string()).optional(),
  console: consoleSchema.optional(),
  stop: stopSchema.optional(),
  configs: z.array(configFileSchema).optional(),
  addons: addonSourcesSchema.optional(),
  volumes: volumesSchema.optional(),
  players: playersSchema.optional(),
  worlds: worldsSchema.optional(),
})

export const variableSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  name: textSchema,
  description: textSchema.optional(),
  type: z.enum(['string', 'number', 'boolean', 'select', 'file']).default('string'),
  default: z.string().default(''),
  file: z.object({ accept: z.string(), path: z.string().regex(/^[\w.-]+(\/[\w.-]+)*$/) }).optional(),
  options: z.array(z.object({ value: z.string(), label: textSchema.optional(), description: textSchema.optional(), icon: z.string().optional(), env: z.record(z.string(), z.string()).optional(), template: templateOverrideSchema.optional() })).optional(),
  source: z.object({ id: z.string(), params: z.record(z.string(), z.string()).default({}), search: z.boolean().default(false) }).optional(),
  when: z.record(z.string(), z.array(z.string())).optional(),
  step: z.enum(['setup', 'settings', 'managed']).default('settings'),
  group: z.string().optional(),
  required: z.boolean().default(false),
  editable: z.boolean().default(true),
  pattern: z.string().optional(),
  preview: z.record(z.string(), z.string()).optional(),
  link: z.object({ url: z.string().url(), text: textSchema }).optional(),
  auto: z.object({ key: z.string(), rules: z.array(z.object({ pattern: z.string(), value: z.string() })).min(1) }).optional(),
  random: z.object({ length: z.number().int().min(4).max(64), chars: z.string().min(2).max(128) }).optional(),
})
export type GameVariable = z.infer<typeof variableSchema>

export const SOURCE_VALUE_PATTERN = /^[\w.+\-]{0,128}$/

export function variableVisible(variable: Pick<GameVariable, 'when'>, values: Record<string, string>): boolean {
  if (!variable.when) return true
  return Object.entries(variable.when).every(([key, allowed]) => allowed.includes(values[key] ?? ''))
}

export interface VariableOption {
  value: string
  label: Text
  hint?: Text
  icon?: string | null
}


export const gameTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: textSchema,
  description: textSchema.optional(),
  icon: z.string().optional(),
  image: z.string().min(1),
  command: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).default({}),
  dataPath: z.string().startsWith('/').default('/data'),
  ports: z.array(z.object({ name: z.string().regex(/^[a-z0-9-]+$/), container: z.number().int().min(1).max(65535), protocol: z.enum(['tcp', 'udp']).default('tcp') })).min(1),
  memory: z.object({ default: z.number().int().min(128), min: z.number().int().min(64).default(256) }).default({ default: 2048, min: 256 }),
  variables: z.array(variableSchema).default([]),
  console: consoleSchema.default({}),
  volumes: volumesSchema.default([]),
  stop: stopSchema.default({ timeout: 60 }),
  healthcheck: z.boolean().default(true),
  players: playersSchema.optional(),
  map: z.object({ providers: z.array(mapProviderSchema).min(1) }).optional(),
  addons: addonSourcesSchema.default([]),
  configs: z.array(configFileSchema).default([]),
  files: z.array(fileRuleSchema).default([]),
  address: z.string().max(256).optional(),
  worlds: worldsSchema.optional(),
  backup: backupSpecSchema.default({ before: [], after: [], wait: 5, exclude: [] }),
  startup: z.string().optional(),
  groups: z.array(z.object({ id: z.string(), name: textSchema, description: textSchema.optional(), collapsed: z.boolean().optional() })).default([]),
})
export type GameTemplate = z.infer<typeof gameTemplateSchema>

export function resolveTemplate(game: GameTemplate, values: Record<string, string>): GameTemplate {
  const all = Object.fromEntries(game.variables.map((v) => [v.key, values[v.key] || v.default]))
  let out = game
  for (const v of game.variables) {
    if (!variableVisible(v, all)) continue
    const override = v.options?.find((o) => o.value === all[v.key])?.template
    if (override) out = { ...out, ...Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined)) }
  }
  return out
}

export type ServerStatus = 'offline' | 'starting' | 'running' | 'stopping'

export interface ServerPort {
  name: string
  container: number
  host: number
  protocol: 'tcp' | 'udp'
}

export const PERMISSIONS = ['console', 'power', 'files', 'config', 'addons', 'settings'] as const
export type Permission = (typeof PERMISSIONS)[number]
export const permissionsSchema = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length)

export interface ServerAccess {
  owner: boolean
  manage: boolean
  permissions: Permission[]
}

export interface Member {
  userId: number
  username: string
  permissions: Permission[]
  createdAt: string
}

export const memberSchema = z.object({ permissions: permissionsSchema })

export interface ServerUpdates {
  image: boolean
  addons: number
  checkedAt: string | null
}

export interface Server {
  id: string
  name: string
  game: string
  memory: number
  cpu: number | null
  icon: string | null
  variables: Record<string, string>
  ports: ServerPort[]
  status: ServerStatus
  startedAt: string | null
  version: string | null
  addons: 'mods' | 'plugins' | null
  address: string | null
  updates: ServerUpdates
  access: ServerAccess
  ownerId: number
  createdAt: string
}

export interface ServerStats {
  at: number
  cpu: number
  memory: number
  memoryLimit: number
  cpuLimit: number
  rx: number
  tx: number
}

export interface QuickStats {
  cpu: number
  cpuLimit: number
  memory: number
  memoryLimit: number
  rxRate: number
  txRate: number
  players: number | null
}

export type ConsoleMessage =
  | { type: 'log'; data: string }
  | { type: 'history'; data: string }
  | { type: 'status'; status: ServerStatus; startedAt: string | null }
  | { type: 'stats'; stats: ServerStats }
  | { type: 'players'; players: string[] }

export const serverIconSchema = z
  .string()
  .max(400_000)
  .refine((v) => /^https:\/\/[^\s"'<>]+$/.test(v) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v), 'icon must be an https URL or an image data URL')
  .nullable()

export const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  icon: serverIconSchema.optional(),
  game: z.string(),
  memory: z.number().int().min(64).max(1024 * 1024),
  cpu: z.number().min(0.1).max(1024).nullable().optional(),
  variables: z.record(z.string(), z.string()).default({}),
  ports: z.record(z.string(), z.number().int().min(1).max(65535)).default({}),
})
export type ServerCreateInput = z.infer<typeof serverCreateSchema>

export const serverUpdateSchema = serverCreateSchema.omit({ game: true, ports: true }).partial()
export type ServerUpdateInput = z.infer<typeof serverUpdateSchema>

export interface Backup {
  name: string
  size: number
  createdAt: string
  auto: boolean
}

export interface BackupsOverview {
  backups: Backup[]
  limit: number
  running: boolean
}

export const backupLimitSchema = z.object({ limit: z.number().int().min(1).max(100) })

export const scheduleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('command'), command: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal('say'), message: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('wait'), seconds: z.number().int().min(1).max(3600) }),
  z.object({ type: z.literal('backup') }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('restart') }),
])
export type ScheduleAction = z.infer<typeof scheduleActionSchema>

export const scheduleSchema = z.object({
  name: z.string().trim().min(1).max(64),
  cron: z.string().trim().max(120).refine((v) => parseCron(v) !== null, 'invalid cron'),
  actions: z.array(scheduleActionSchema).min(1).max(30),
  enabled: z.boolean().default(true),
})
export type ScheduleInput = z.infer<typeof scheduleSchema>

export interface Schedule extends ScheduleInput {
  id: number
  lastRunAt: string | null
  lastError: string | null
  nextRunAt: string | null
  running: boolean
}

export interface SchedulesOverview {
  schedules: Schedule[]
  timeZone: string
}

export const powerSchema = z.object({ action: z.enum(['start', 'stop', 'restart', 'kill']) })
export type PowerAction = z.infer<typeof powerSchema>['action']

export interface FileEntry {
  name: string
  dir: boolean
  size: number
  modifiedAt: string
}

export type PlayerList = 'ops' | 'whitelist' | 'bans'

export interface PlayerEntry {
  name: string
  uuid: string | null
  reason: string | null
  level: number | null
}

export interface PlayerRecord {
  name: string
  uuid: string | null
  op: boolean
  banned: boolean
  allowed: boolean
}

export interface AddonSourceInfo {
  id: string
  name: string
  versions: boolean
  updates: boolean
  missing?: string
}

export interface AddonProject {
  id: string
  name: string
  description: string
  author: string
  icon: string | null
  downloads: number
  url: string
}

export interface AddonSearchResult {
  items: AddonProject[]
  total: number
  pageSize: number
}

export interface AddonVersion {
  id: string
  name: string
  version: string
  gameVersions: string[]
  loaders: string[]
  publishedAt: string
}

export interface AddonEntry {
  path: string
  fileName: string
  size: number
  enabled: boolean
  source: string | null
  projectId: string | null
  versionId: string | null
  name: string
  version: string | null
  icon: string | null
  url: string | null
  addedAt?: string | null
}

export interface ModpackStatus {
  name: string | null
  icon: string | null
  url: string | null
  current: string | null
  latest: string | null
  pinned: boolean
}

export interface AddonsOverview {
  sources: AddonSourceInfo[]
  entries: AddonEntry[]
  modpack: boolean
  loader: string | null
  gameVersion: string | null
}

export interface AddonUpdate {
  path: string
  versionId: string
  version: string
}

export const addonInstallSchema = z.object({ source: z.string(), projectId: z.string().min(1).max(128), versionId: z.string().max(128).optional() })
export const addonPathSchema = z.object({ path: z.string().min(1).max(512) })
export const addonToggleSchema = addonPathSchema.extend({ enabled: z.boolean() })
export const addonUpdateSchema = z.object({ paths: z.array(z.string().min(1).max(512)).min(1).max(500) })

export interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  locale: Locale
  createdAt: string
}

export interface Invite {
  id: number
  code: string
  role: 'admin' | 'user'
  note: string | null
  expiresAt: string | null
  multiUse: boolean
  uses: number
  usedAt: string | null
  usedBy: string | null
  joined: string[]
  serverId: string | null
  serverName: string | null
  permissions: Permission[] | null
  createdAt: string
}

export interface InviteInfo {
  valid: boolean
  role: 'admin' | 'user' | null
  server: { id: string; name: string } | null
}

export interface SessionInfo {
  id: string
  userAgent: string | null
  ip: string | null
  createdAt: string
  current: boolean
}

export interface AdminUser extends User {
  servers: number
  memberships: number
}

export type ProviderId = 'modrinth' | 'curseforge' | 'thunderstore' | 'workshop' | 'mojang'

export interface ProviderInfo {
  id: ProviderId
  url: string
  needsKey: boolean
  keySource: 'settings' | 'env' | null
}

export const usernameSchema = z.string().regex(/^[a-zA-Z0-9_.-]{3,32}$/)
export const passwordSchema = z.string().min(8).max(200)
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema })
export const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) })
export const registerSchema = z.object({ code: z.string().min(1).max(64), username: usernameSchema, password: passwordSchema })
export const inviteCreateSchema = z.object({
  role: z.enum(['admin', 'user']).default('user'),
  note: z.string().trim().max(120).nullish(),
  days: z.number().int().min(1).max(365).nullish(),
  multiUse: z.boolean().default(false),
})
export const serverInviteCreateSchema = z.object({
  permissions: permissionsSchema,
  note: z.string().trim().max(120).nullish(),
  days: z.number().int().min(1).max(365).nullish(),
  multiUse: z.boolean().default(false),
})
export const userRoleSchema = z.object({ role: z.enum(['admin', 'user']) })
export const providerKeySchema = z.object({ key: z.string().trim().max(200).nullable() })
export const localeSchema = z.object({ locale: z.enum(['ru', 'en']) })
export { parseProperties, updateProperties } from './properties'
export { type Cron, cronMatches, nextCronRun, parseCron } from './cron'
export { parseJsonConfig, parseJsonList, updateJsonConfig, writeJsonList } from './json-config'
export { type BepinexEntry, type BepinexFile, bepinexId, parseBepinex, parseIdList, updateBepinex, writeIdList } from './bepinex'

export function serverHeap(memory: number): number {
  return Math.max(256, Math.floor((memory - Math.max(512, memory * 0.15)) / 64) * 64)
}

export function builtinVariables(memory: number): Record<string, string> {
  return { SERVER_MEMORY: String(memory), SERVER_HEAP: String(serverHeap(memory)) }
}

export function startupLine(game: GameTemplate, values: Record<string, string>, memory: number): string | null {
  if (!game.startup) return null
  const all: Record<string, string> = { ...builtinVariables(memory) }
  for (const v of game.variables) {
    const value = values[v.key] ?? v.default
    all[v.key] = variableVisible(v, Object.fromEntries(game.variables.map((x) => [x.key, values[x.key] ?? x.default]))) ? (v.preview ? (v.preview[value] ?? '') : value) : ''
  }
  return game.startup
    .replace(/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g, (_, key: string) => all[key] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface PortCheck {
  name: string
  protocol: 'tcp' | 'udp'
  requested: number | null
  free: boolean
  port: number
}
