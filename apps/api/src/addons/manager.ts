import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AddonEntry, AddonSourceInfo, AddonUpdate, AddonsOverview, ModpackStatus } from '@hako/shared'
import { interpolate, serverGame } from '../games/registry'
import { badRequest, fetchJson, notFound } from '../lib/http'
import type { ServerRow } from '../runtime/instances'
import { resolveInside } from '../services/files'
import { download } from './download'
import { curseforge } from './curseforge'
import { modrinth } from './modrinth'
import { thunderstore } from './thunderstore'
import type { AddonContext, AddonSource, IdentifiedFile, ManagedSource } from './types'
import { workshop } from './workshop'

const SOURCES: AddonSource[] = [modrinth, curseforge]
const MANAGED: ManagedSource[] = [thunderstore, workshop]

function managed(server: ServerRow): { source: ManagedSource; ctx: AddonContext } | null {
  const game = serverGame(server)
  const vars = { ...server.variables, SERVER_ID: server.id, SERVER_NAME: server.name }
  for (const a of game?.addons ?? []) {
    const source = MANAGED.find((s) => s.id === a.source)
    if (source) return { source, ctx: { params: Object.fromEntries(Object.entries(a.params).map(([k, v]) => [k, interpolate(v, vars)])) } }
  }
  return null
}
const DISABLED = '.disabled'
const SCAN_DIRS = ['mods', 'plugins']
const hashes = new Map<string, { key: string; sha1: string }>()

interface ScannedFile {
  path: string
  fileName: string
  size: number
  enabled: boolean
  sha1: string
  mtime: number
}

interface Prepared {
  source: AddonSource
  ctx: AddonContext
  available: boolean
}

function configured(server: ServerRow): Prepared[] {
  const game = serverGame(server)
  if (!game) return []
  const vars = { ...server.variables, SERVER_ID: server.id, SERVER_NAME: server.name }
  return game.addons.flatMap((a) => {
    const source = SOURCES.find((s) => s.id === a.source)
    if (!source) return []
    const params = Object.fromEntries(Object.entries(a.params).map(([k, v]) => [k, interpolate(v, vars)]))
    const ctx = { params: linked(server) ? { ...params, loader: '', gameVersion: '' } : params }
    return [{ source, ctx, available: source.available(ctx) }]
  })
}

const UNLINKABLE = ['fabric', 'quilt', 'forge', 'neoforge']

export function addonKind(server: ServerRow): 'mods' | 'plugins' | null {
  if (!serverGame(server)?.addons.length) return null
  if (managed(server) || linked(server)) return 'mods'
  return configured(server).map((p) => p.source.kind(p.ctx)).find(Boolean) ?? null
}

function linked(server: ServerRow) {
  return server.variables.KIND === 'modpack'
}

async function sha1(file: string, size: number, mtime: number): Promise<string> {
  const key = `${size}:${mtime}`
  const hit = hashes.get(file)
  if (hit?.key === key) return hit.sha1
  const value = createHash('sha1').update(await fs.readFile(file)).digest('hex')
  hashes.set(file, { key, sha1: value })
  return value
}

async function scan(server: ServerRow, dirs: string[]): Promise<ScannedFile[]> {
  const out: ScannedFile[] = []
  for (const dir of new Set(dirs)) {
    const full = await resolveInside(server.id, dir)
    const entries = await fs.readdir(full, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (!e.isFile() || !/\.jar(\.disabled)?$/i.test(e.name)) continue
      const file = path.join(full, e.name)
      const stat = await fs.stat(file)
      const enabled = !e.name.endsWith(DISABLED)
      out.push({ path: path.posix.join(dir, e.name), fileName: enabled ? e.name : e.name.slice(0, -DISABLED.length), size: stat.size, enabled, mtime: stat.mtimeMs, sha1: await sha1(file, stat.size, stat.mtimeMs) })
    }
  }
  return out.sort((a, b) => a.fileName.localeCompare(b.fileName))
}

async function load(server: ServerRow) {
  const prepared = configured(server)
  const files = await scan(server, [...SCAN_DIRS, ...prepared.flatMap((p) => p.source.dir(p.ctx) ?? [])])
  const known = new Map<string, { source: AddonSource; info: IdentifiedFile }>()
  for (const p of prepared) {
    const found = await p.source.identify(files.map((f) => f.sha1)).catch(() => new Map<string, IdentifiedFile>())
    for (const [hash, info] of found) if (!known.has(hash)) known.set(hash, { source: p.source, info })
    if (!p.available) {
      const inferred = p.source.infer([...found.values()])
      if (inferred) {
        p.ctx = { params: { ...p.ctx.params, ...inferred } }
        p.available = p.source.available(p.ctx)
      }
    }
  }
  return { prepared: prepared.filter((p) => p.available), files, known }
}

export async function addonsOverview(server: ServerRow): Promise<AddonsOverview> {
  const m = managed(server)
  if (m) return { sources: [{ id: m.source.id, name: m.source.name, versions: false, updates: m.source.updatable }], entries: await m.source.list(server, m.ctx), modpack: false, loader: null, gameVersion: null }
  const { prepared, files, known } = await load(server)
  const entries: AddonEntry[] = files.map((f) => {
    const k = known.get(f.sha1)
    return {
      path: f.path,
      fileName: f.fileName,
      size: f.size,
      enabled: f.enabled,
      source: k?.source.id ?? null,
      projectId: k?.info.projectId ?? null,
      versionId: k?.info.versionId ?? null,
      name: k?.info.name ?? f.fileName.replace(/\.jar$/i, ''),
      version: k?.info.version ?? null,
      icon: k?.info.icon ?? null,
      url: k?.info.url ?? null,
      addedAt: new Date(f.mtime).toISOString(),
    }
  })
  const first = prepared[0]
  return {
    sources: [
      ...prepared.map((p) => ({ id: p.source.id, name: p.source.name, versions: true, updates: true }) satisfies AddonSourceInfo),
      ...configured(server).flatMap((p) => {
        const missing = p.available ? null : p.source.missing?.(p.ctx)
        return missing && !prepared.some((x) => x.source === p.source) ? [{ id: p.source.id, name: p.source.name, versions: true, updates: false, missing } satisfies AddonSourceInfo] : []
      }),
    ],
    entries,
    modpack: linked(server),
    loader: first?.ctx.params.loader ?? null,
    gameVersion: first?.ctx.params.gameVersion ?? null,
  }
}

export async function addonSource(server: ServerRow, id: string): Promise<{ source: Pick<ManagedSource, 'search' | 'versions'>; ctx: AddonContext }> {
  const m = managed(server)
  if (m) return m.source.id === id ? m : badRequest('ADDONS_UNSUPPORTED')
  const found = (await load(server)).prepared.find((p) => p.source.id === id)
  if (!found) badRequest('ADDONS_UNSUPPORTED')
  return found
}

export async function addonUpdates(server: ServerRow): Promise<AddonUpdate[]> {
  const m = managed(server)
  if (m) return m.source.checkUpdates(server, m.ctx)
  const { prepared, files, known } = await load(server)
  const out: AddonUpdate[] = []
  for (const p of prepared) {
    const mine = files.filter((f) => known.get(f.sha1)?.source === p.source)
    const latest = await p.source.latest(p.ctx, mine.map((f) => f.sha1))
    for (const f of mine) {
      const next = latest.get(f.sha1)
      if (next && next.versionId !== known.get(f.sha1)!.info.versionId) out.push({ path: f.path, ...next })
    }
  }
  return out
}


async function writeAddon(server: ServerRow, source: AddonSource, ctx: AddonContext, projectId: string, versionId?: string) {
  const resolved = await source.resolve(ctx, projectId, versionId)
  if (!/^[\w.+\-() ]+$/.test(resolved.fileName)) badRequest('ADDON_DOWNLOAD_FAILED')
  const target = await resolveInside(server.id, path.posix.join(resolved.dir, resolved.fileName), false)
  const data = await download(resolved.url, resolved.sha1)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, data)
  return { resolved, path: path.posix.join(resolved.dir, resolved.fileName) }
}

export async function installAddon(server: ServerRow, sourceId: string, projectId: string, versionId?: string): Promise<string[]> {
  if (linked(server)) badRequest('MODPACK_LINKED')
  const m = managed(server)
  if (m) return m.source.id === sourceId ? m.source.install(server, m.ctx, projectId) : badRequest('ADDONS_UNSUPPORTED')
  const { prepared, files, known } = await load(server)
  const p = prepared.find((x) => x.source.id === sourceId)
  if (!p) badRequest('ADDONS_UNSUPPORTED')
  const present = new Set(files.map((f) => known.get(f.sha1)?.info.projectId).filter(Boolean))
  const installed: string[] = []
  const queue: { projectId: string; versionId?: string }[] = [{ projectId, versionId }]
  while (queue.length) {
    const next = queue.shift()!
    if (next.projectId !== projectId && present.has(next.projectId)) continue
    for (const f of files.filter((x) => known.get(x.sha1)?.info.projectId === next.projectId)) {
      await fs.rm(await resolveInside(server.id, f.path, false), { force: true })
    }
    try {
      const { resolved } = await writeAddon(server, p.source, p.ctx, next.projectId, next.versionId)
      present.add(next.projectId)
      installed.push(resolved.name)
      for (const dep of resolved.dependencies) if (!present.has(dep)) queue.push({ projectId: dep })
    } catch (e) {
      if (next.projectId === projectId) throw e
      console.warn(`[hako] dependency ${next.projectId} of ${projectId} was not installed: ${e instanceof Error ? e.message : e}`)
    }
  }
  return installed
}

export async function updateAddons(server: ServerRow, paths: string[]): Promise<number> {
  if (linked(server)) badRequest('MODPACK_LINKED')
  const m = managed(server)
  if (m) return m.source.update(server, m.ctx, paths)
  const updates = new Map((await addonUpdates(server)).map((u) => [u.path, u]))
  const { prepared, files, known } = await load(server)
  let count = 0
  for (const target of paths) {
    const update = updates.get(target)
    const file = files.find((f) => f.path === target)
    const k = file && known.get(file.sha1)
    const p = k && prepared.find((x) => x.source === k.source)
    if (!update || !file || !k || !p) continue
    const { path: written } = await writeAddon(server, p.source, p.ctx, k.info.projectId, update.versionId)
    if (written !== file.path) await fs.rm(await resolveInside(server.id, file.path, false), { force: true })
    if (!file.enabled) await fs.rename(await resolveInside(server.id, written, false), await resolveInside(server.id, written + DISABLED, false))
    count += 1
  }
  return count
}

function addonPath(relative: string) {
  const normalized = path.posix.normalize(relative)
  if (!SCAN_DIRS.some((d) => normalized.startsWith(`${d}/`)) || !/\.jar(\.disabled)?$/i.test(normalized)) notFound('ADDON_NOT_FOUND')
  return normalized
}

export async function setAddonEnabled(server: ServerRow, relative: string, enabled: boolean) {
  if (linked(server)) badRequest('MODPACK_LINKED')
  const m = managed(server)
  if (m) return m.source.setEnabled(server, m.ctx, relative, enabled)
  const current = addonPath(relative)
  const isEnabled = !current.endsWith(DISABLED)
  if (isEnabled === enabled) return
  const next = enabled ? current.slice(0, -DISABLED.length) : current + DISABLED
  await fs.rename(await resolveInside(server.id, current, false), await resolveInside(server.id, next, false)).catch(() => notFound('ADDON_NOT_FOUND'))
}

export async function removeAddon(server: ServerRow, relative: string) {
  if (linked(server)) badRequest('MODPACK_LINKED')
  const m = managed(server)
  if (m) return m.source.remove(server, m.ctx, relative)
  await fs.rm(await resolveInside(server.id, addonPath(relative), false), { force: true })
}

async function readEnv(server: ServerRow, file: string): Promise<Record<string, string>> {
  const text = await fs.readFile(await resolveInside(server.id, file, false), 'utf8').catch(() => '')
  return Object.fromEntries([...text.matchAll(/^([A-Z_]+)="?(.*?)"?$/gm)].map((m) => [m[1]!, m[2]!]))
}

export async function modpackStatus(server: ServerRow): Promise<ModpackStatus | null> {
  if (!linked(server)) return null
  const installed = { ...(await readEnv(server, '.install-curseforge.env')), ...(await readEnv(server, '.install-modrinth.env')) }
  const base: ModpackStatus = { name: installed.MODPACK_NAME ?? null, icon: null, url: null, current: installed.MODPACK_VERSION ?? null, latest: null, pinned: Boolean(server.variables.MODRINTH_VERSION || server.variables.CF_FILE_ID) }
  const slug = server.variables.MODRINTH_MODPACK
  if (!slug || server.variables.PLATFORM !== 'MODRINTH') return base
  try {
    const project = await fetchJson<{ title: string; slug: string; icon_url: string | null }>(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`)
    const versions = await fetchJson<{ version_number: string; version_type: string }[]>(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`)
    const latest = versions.find((v) => v.version_type === 'release') ?? versions[0]
    return { ...base, name: project.title, icon: project.icon_url, url: `https://modrinth.com/modpack/${project.slug}`, latest: latest?.version_number ?? null }
  } catch {
    return base
  }
}

export async function modpackBase(server: ServerRow): Promise<Record<string, string>> {
  if (!linked(server)) badRequest('MODPACK_NOT_LINKED')
  const params = (await load(server)).prepared[0]?.ctx.params
  if (!params?.loader || !params.gameVersion || !UNLINKABLE.includes(params.loader)) badRequest('MODPACK_UNKNOWN')
  return { KIND: 'core', TYPE: params.loader.toUpperCase(), VERSION: params.gameVersion }
}
