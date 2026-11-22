import fs from 'node:fs'
import path from 'node:path'
import type { AddonVersion } from '@hako/shared'
import { HTTPException } from 'hono/http-exception'
import { env } from '../env'
import { badRequest } from '../lib/http'
import { curseforgeKey } from '../services/settings'
import { gameVersion } from './modrinth'
import type { AddonContext, AddonSource, IdentifiedFile } from './types'

const API = 'https://api.curseforge.com/v1'
const MINECRAFT = 432
const PAGE = 20
const CACHE_FILE = path.join(env.dataDir, 'curseforge-files.json')

const LOADERS: Record<string, { type: 'mod' | 'plugin'; classId: number; loader?: number; name: string; dir: string }> = {
  forge: { type: 'mod', classId: 6, loader: 1, name: 'Forge', dir: 'mods' },
  fabric: { type: 'mod', classId: 6, loader: 4, name: 'Fabric', dir: 'mods' },
  quilt: { type: 'mod', classId: 6, loader: 5, name: 'Quilt', dir: 'mods' },
  neoforge: { type: 'mod', classId: 6, loader: 6, name: 'NeoForge', dir: 'mods' },
  paper: { type: 'plugin', classId: 5, name: 'Bukkit', dir: 'plugins' },
  purpur: { type: 'plugin', classId: 5, name: 'Bukkit', dir: 'plugins' },
}

interface CfMod {
  id: number
  name: string
  slug: string
  summary: string
  downloadCount: number
  logo: { thumbnailUrl: string } | null
  links: { websiteUrl: string | null }
  authors: { name: string }[]
}

interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  fileDate: string
  downloadUrl: string | null
  gameVersions: string[]
  hashes: { value: string; algo: number }[]
  dependencies: { modId: number; relationType: number }[]
}

let cache: Record<string, IdentifiedFile> | null = null

function files(): Record<string, IdentifiedFile> {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<string, IdentifiedFile>
    } catch {
      cache = {}
    }
  }
  return cache
}

function remember(sha1: string, info: IdentifiedFile) {
  files()[sha1] = info
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache))
}

async function cf<T>(url: string): Promise<T> {
  const key = curseforgeKey()
  if (!key) badRequest('CURSEFORGE_KEY_MISSING')
  const res = await fetch(`${API}${url}`, { headers: { 'x-api-key': key, Accept: 'application/json', 'User-Agent': env.userAgent }, signal: AbortSignal.timeout(20_000) }).catch(() => null)
  if (!res?.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
  return ((await res.json()) as { data: T }).data
}

function loaderOf(ctx: AddonContext) {
  return LOADERS[(ctx.params.loader ?? '').toLowerCase()]
}

const sha1Of = (file: CfFile) => file.hashes.find((h) => h.algo === 1)?.value
const versionOf = (file: CfFile) => file.displayName.replace(/\.jar$/i, '')
const cdn = (file: CfFile) => file.downloadUrl ?? `https://edge.forgecdn.net/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`

async function compatibleFiles(ctx: AddonContext, modId: string): Promise<CfFile[]> {
  const loader = loaderOf(ctx)
  if (!loader) badRequest('ADDONS_UNSUPPORTED')
  const q = new URLSearchParams({ gameVersion: await gameVersion(ctx), pageSize: '50' })
  if (loader.loader) q.set('modLoaderType', String(loader.loader))
  return cf<CfFile[]>(`/mods/${encodeURIComponent(modId)}/files?${q}`)
}

export const curseforge: AddonSource = {
  id: 'curseforge',
  name: 'CurseForge',
  available: (ctx) => Boolean(loaderOf(ctx) && curseforgeKey()),
  missing: (ctx) => (loaderOf(ctx) && !curseforgeKey() ? 'CURSEFORGE_KEY_MISSING' : null),
  kind: (ctx) => (loaderOf(ctx)?.type === 'plugin' ? 'plugins' : loaderOf(ctx) ? 'mods' : null),
  dir: (ctx) => loaderOf(ctx)?.dir ?? null,
  async identify(hashes) {
    const known = files()
    return new Map(hashes.filter((h) => known[h]).map((h) => [h, known[h]!]))
  },
  async latest(ctx, hashes) {
    const out = new Map<string, { versionId: string; version: string }>()
    const known = files()
    for (const hash of hashes) {
      const info = known[hash]
      if (!info) continue
      const newest = (await compatibleFiles(ctx, info.projectId).catch(() => []))[0]
      if (newest && String(newest.id) !== info.versionId) out.set(hash, { versionId: String(newest.id), version: versionOf(newest) })
    }
    return out
  },
  infer: () => null,
  async search(ctx, query, offset) {
    const loader = loaderOf(ctx)
    if (!loader) badRequest('ADDONS_UNSUPPORTED')
    const index = Math.min(offset, 10_000 - PAGE)
    const q = new URLSearchParams({ gameId: String(MINECRAFT), classId: String(loader.classId), gameVersion: await gameVersion(ctx), sortField: query ? '2' : '6', sortOrder: 'desc', index: String(index), pageSize: String(PAGE) })
    if (query) q.set('searchFilter', query)
    if (loader.loader) q.set('modLoaderType', String(loader.loader))
    const key = curseforgeKey()
    if (!key) badRequest('CURSEFORGE_KEY_MISSING')
    const res = await fetch(`${API}/mods/search?${q}`, { headers: { 'x-api-key': key, Accept: 'application/json', 'User-Agent': env.userAgent }, signal: AbortSignal.timeout(20_000) }).catch(() => null)
    if (!res?.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
    const body = (await res.json()) as { data: CfMod[]; pagination: { totalCount: number } }
    return {
      total: Math.min(body.pagination.totalCount, 10_000),
      pageSize: PAGE,
      items: body.data.map((m) => ({ id: String(m.id), name: m.name, description: m.summary, author: m.authors[0]?.name ?? '', icon: m.logo?.thumbnailUrl ?? null, downloads: m.downloadCount, url: m.links.websiteUrl ?? `https://www.curseforge.com/minecraft/mc-mods/${m.slug}` })),
    }
  },
  async versions(ctx, projectId): Promise<AddonVersion[]> {
    const loader = loaderOf(ctx)
    return (await compatibleFiles(ctx, projectId)).map((f) => ({ id: String(f.id), name: f.displayName, version: versionOf(f), gameVersions: f.gameVersions.filter((v) => /^\d/.test(v)), loaders: loader ? [loader.name.toLowerCase()] : [], publishedAt: f.fileDate }))
  },
  async resolve(ctx, projectId, versionId) {
    const loader = loaderOf(ctx)
    if (!loader) badRequest('ADDONS_UNSUPPORTED')
    const file = versionId ? await cf<CfFile>(`/mods/${encodeURIComponent(projectId)}/files/${encodeURIComponent(versionId)}`) : (await compatibleFiles(ctx, projectId))[0]
    if (!file || String(file.modId) !== projectId) badRequest('ADDON_NO_VERSION')
    const mod = await cf<CfMod>(`/mods/${encodeURIComponent(projectId)}`)
    const sha1 = sha1Of(file)
    if (sha1) remember(sha1, { projectId, versionId: String(file.id), version: versionOf(file), name: mod.name, icon: mod.logo?.thumbnailUrl ?? null, url: mod.links.websiteUrl, loaders: [loader.name.toLowerCase()], gameVersions: file.gameVersions })
    return {
      projectId,
      versionId: String(file.id),
      name: mod.name,
      version: versionOf(file),
      url: cdn(file),
      fileName: file.fileName,
      dir: loader.dir,
      sha1,
      dependencies: file.dependencies.filter((d) => d.relationType === 3).map((d) => String(d.modId)),
    }
  },
}
