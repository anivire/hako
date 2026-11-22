import type {
  AdminUser,
  InviteInfo,
  Member,
  Permission,
  ProviderInfo,
  AddonSearchResult,
  AddonUpdate,
  AddonVersion,
  AddonsOverview,
  FileEntry,
  PlayerEntry,
  PlayerList,
  PlayerRecord,
  GameTemplate,
  Invite,
  Locale,
  PowerAction,
  Server,
  ServerCreateInput,
  ServerUpdateInput,
  PortCheck,
  User,
  VariableOption,
} from '@hako/shared'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const raw = body instanceof Blob
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      message = ((await res.json()) as { error?: string }).error ?? message
    } catch {}
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

const get = <T>(path: string) => request<T>('GET', path)
const at = (id: string) => `/servers/${encodeURIComponent(id)}`
const p = (path: string) => `path=${encodeURIComponent(path)}`

export const api = {
  me: () => get<User>('/auth/me'),
  login: (username: string, password: string) => request<User>('POST', '/auth/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  invite: (code: string) => get<InviteInfo>(`/auth/invite/${encodeURIComponent(code)}`),
  register: (code: string, username: string, password: string) => request<User>('POST', '/auth/register', { code, username, password }),
  setLocale: (locale: Locale) => request<User>('PATCH', '/auth/locale', { locale }),

  users: () => get<AdminUser[]>('/admin/users'),
  setUserRole: (id: number, role: 'admin' | 'user') => request<AdminUser[]>('PATCH', `/admin/users/${id}`, { role }),
  deleteUser: (id: number) => request<AdminUser[]>('DELETE', `/admin/users/${id}`),
  invites: () => get<Invite[]>('/admin/invites'),
  createInvite: (input: { role: 'admin' | 'user'; note: string | null; days: number | null; multiUse: boolean }) => request<{ code: string; invites: Invite[] }>('POST', '/admin/invites', input),
  deleteInvite: (id: number) => request<Invite[]>('DELETE', `/admin/invites/${id}`),
  providers: () => get<ProviderInfo[]>('/admin/providers'),
  setCurseforgeKey: (key: string | null) => request<ProviderInfo[]>('PUT', '/admin/providers/curseforge', { key }),
  findUsers: (q: string) => get<{ id: number; username: string }[]>(`/users?q=${encodeURIComponent(q)}`),
  acceptInvite: (code: string) => request<{ serverId: string }>('POST', `/auth/invite/${encodeURIComponent(code)}/accept`),
  members: (id: string) => get<Member[]>(`${at(id)}/members`),
  setMember: (id: string, userId: number, permissions: Permission[]) => request<Member[]>('PUT', `${at(id)}/members/${userId}`, { permissions }),
  removeMember: (id: string, userId: number) => request<Member[]>('DELETE', `${at(id)}/members/${userId}`),
  serverInvites: (id: string) => get<Invite[]>(`${at(id)}/invites`),
  createServerInvite: (id: string, input: { permissions: Permission[]; note: string | null; days: number | null; multiUse: boolean }) => request<{ code: string; invites: Invite[] }>('POST', `${at(id)}/invites`, input),
  deleteServerInvite: (id: string, inviteId: number) => request<Invite[]>('DELETE', `${at(id)}/invites/${inviteId}`),

  system: () => get<{ docker: boolean }>('/system'),
  games: () => get<GameTemplate[]>('/games'),
  portCheck: (game: string, ports: Record<string, string>) => get<PortCheck[]>(`/games/${encodeURIComponent(game)}/ports?${new URLSearchParams(ports)}`),
  variableOptions: (game: string, key: string, q: string, vars: Record<string, string>) =>
    get<VariableOption[]>(`/games/${encodeURIComponent(game)}/options/${encodeURIComponent(key)}?q=${encodeURIComponent(q)}&vars=${encodeURIComponent(JSON.stringify(vars))}`),
  servers: () => get<Server[]>('/servers'),
  server: (id: string) => get<Server>(at(id)),
  createServer: (input: ServerCreateInput) => request<Server>('POST', '/servers', input),
  updateServer: (id: string, input: ServerUpdateInput) => request<Server>('PATCH', at(id), input),
  deleteServer: (id: string) => request<{ ok: true }>('DELETE', at(id)),
  power: (id: string, action: PowerAction) => request<{ ok: true }>('POST', `${at(id)}/power`, { action }),

  process: (id: string) => get<{ command: string | null }>(`${at(id)}/process`),
  usage: (id: string) => get<{ bytes: number }>(`${at(id)}/usage`),
  files: (id: string, path: string) => get<FileEntry[]>(`${at(id)}/files?${p(path)}`),
  readFile: (id: string, path: string) => get<{ content: string }>(`${at(id)}/files/content?${p(path)}`),
  writeFile: (id: string, path: string, content: string) => request<{ ok: true }>('PUT', `${at(id)}/files/content?${p(path)}`, { content }),
  makeDir: (id: string, path: string) => request<{ ok: true }>('POST', `${at(id)}/files/folder?${p(path)}`),
  upload: (id: string, path: string, file: Blob) => request<{ ok: true }>('POST', `${at(id)}/files/upload?${p(path)}`, file),
  uploadUrl: (id: string, path: string) => `/api${at(id)}/files/upload?${p(path)}`,
  movePath: (id: string, from: string, to: string) => request<{ ok: true }>('POST', `${at(id)}/files/move?${p(from)}`, { to }),
  removePath: (id: string, path: string) => request<{ ok: true }>('DELETE', `${at(id)}/files?${p(path)}`),
  downloadUrl: (id: string, path: string) => `/api${at(id)}/files/download?${p(path)}`,

  addons: (id: string) => get<AddonsOverview>(`${at(id)}/addons`),
  roster: (id: string) => get<PlayerRecord[]>(`${at(id)}/players`),
  kickPlayer: (id: string, name: string) => request<{ ok: true }>('POST', `${at(id)}/players/kick`, { name }),
  players: (id: string, list: PlayerList) => get<PlayerEntry[]>(`${at(id)}/players/${list}`),
  addPlayer: (id: string, list: PlayerList, name: string) => request<{ via: 'console' | 'file' }>('POST', `${at(id)}/players/${list}`, { name }),
  removePlayer: (id: string, list: PlayerList, name: string) => request<{ via: 'console' | 'file' }>('DELETE', `${at(id)}/players/${list}?name=${encodeURIComponent(name)}`),
  addonIcon: (id: string, url: string) => `/api${at(id)}/addons/icon?url=${encodeURIComponent(url)}`,
  unlinkModpack: (id: string) => request<Server>('POST', `${at(id)}/addons/unlink`),
  addonUpdates: (id: string) => get<AddonUpdate[]>(`${at(id)}/addons/updates`),
  updateAddons: (id: string, paths: string[]) => request<{ updated: number }>('POST', `${at(id)}/addons/update`, { paths }),
  searchAddons: (id: string, source: string, q: string, offset: number) => get<AddonSearchResult>(`${at(id)}/addons/${source}/search?q=${encodeURIComponent(q)}&offset=${offset}`),
  addonVersions: (id: string, source: string, project: string) => get<AddonVersion[]>(`${at(id)}/addons/${source}/${encodeURIComponent(project)}/versions`),
  installAddon: (id: string, source: string, projectId: string, versionId?: string) => request<{ installed: string[] }>('POST', `${at(id)}/addons`, { source, projectId, versionId }),
  toggleAddon: (id: string, path: string, enabled: boolean) => request<{ ok: true }>('PATCH', `${at(id)}/addons`, { path, enabled }),
  removeAddon: (id: string, path: string) => request<{ ok: true }>('DELETE', `${at(id)}/addons?${p(path)}`),

  consoleUrl: (id: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api${at(id)}/ws`,
}
