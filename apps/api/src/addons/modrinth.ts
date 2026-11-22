import type { AddonVersion } from '@hako/shared'
import { HTTPException } from 'hono/http-exception'
import { env } from '../env'
import { badRequest, fetchJson } from '../lib/http'
import type { AddonContext, AddonSource, IdentifiedFile } from './types'

const API = 'https://api.modrinth.com/v2'

const LOADERS: Record<string, { type: 'mod' | 'plugin'; loaders: string[]; dir: string }> = {
  fabric: { type: 'mod', loaders: ['fabric'], dir: 'mods' },
  quilt: { type: 'mod', loaders: ['quilt', 'fabric'], dir: 'mods' },
  forge: { type: 'mod', loaders: ['forge'], dir: 'mods' },
  neoforge: { type: 'mod', loaders: ['neoforge'], dir: 'mods' },
  paper: { type: 'plugin', loaders: ['paper', 'spigot', 'bukkit'], dir: 'plugins' },
  purpur: { type: 'plugin', loaders: ['purpur', 'paper', 'spigot', 'bukkit'], dir: 'plugins' },
  folia: { type: 'plugin', loaders: ['folia'], dir: 'plugins' },
}

interface MrVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  date_published: string
  files: { url: string; filename: string; primary: boolean; hashes: { sha1?: string } }[]
  dependencies: { project_id: string | null; dependency_type: string }[]
}

let latestRelease: { value: string; at: number } | null = null

async function gameVersion(ctx: AddonContext): Promise<string> {
  const raw = ctx.params.gameVersion ?? ''
  if (raw && raw.toUpperCase() !== 'LATEST') return raw
  if (latestRelease && Date.now() - latestRelease.at < 3_600_000) return latestRelease.value
  const tags = await fetchJson<{ version: string; version_type: string }[]>(`${API}/tag/game_version`)
  const value = tags.find((t) => t.version_type === 'release')?.version ?? ''
  latestRelease = { value, at: Date.now() }
  return value
}

function loaderOf(ctx: AddonContext) {
  return LOADERS[(ctx.params.loader ?? '').toLowerCase()]
}

async function compatibleVersions(ctx: AddonContext, projectId: string): Promise<MrVersion[]> {
  const loader = loaderOf(ctx)
  if (!loader) badRequest('ADDONS_UNSUPPORTED')
  const q = new URLSearchParams({ loaders: JSON.stringify(loader.loaders), game_versions: JSON.stringify([await gameVersion(ctx)]) })
  return fetchJson<MrVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${q}`)
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': env.userAgent, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
  return (await res.json()) as T
}

const identified = new Map<string, IdentifiedFile | null>()
const CHUNK = 200

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export const modrinth: AddonSource = {
  id: 'modrinth',
  name: 'Modrinth',
  available: (ctx) => Boolean(loaderOf(ctx)),
  dir: (ctx) => loaderOf(ctx)?.dir ?? null,
  async identify(hashes) {
    const missing = [...new Set(hashes)].filter((h) => !identified.has(h))
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK)
      const versions = await postJson<Record<string, MrVersion>>(`${API}/version_files`, { hashes: chunk, algorithm: 'sha1' })
      const ids = [...new Set(Object.values(versions).map((v) => v.project_id))]
      const projects = ids.length ? await fetchJson<{ id: string; slug: string; title: string; icon_url: string | null; project_type: string }[]>(`${API}/projects?${new URLSearchParams({ ids: JSON.stringify(ids) })}`) : []
      const byId = new Map(projects.map((p) => [p.id, p]))
      for (const hash of chunk) {
        const v = versions[hash]
        const p = v ? byId.get(v.project_id) : undefined
        identified.set(
          hash,
          v && p ? { projectId: p.id, versionId: v.id, version: v.version_number, name: p.title, icon: p.icon_url || null, url: `https://modrinth.com/${p.project_type}/${p.slug}`, loaders: v.loaders, gameVersions: v.game_versions } : null,
        )
      }
    }
    const out = new Map<string, IdentifiedFile>()
    for (const h of hashes) {
      const found = identified.get(h)
      if (found) out.set(h, found)
    }
    return out
  },
  async latest(ctx, hashes) {
    const loader = loaderOf(ctx)
    const out = new Map<string, { versionId: string; version: string }>()
    if (!loader || !hashes.length) return out
    const gv = await gameVersion(ctx)
    for (let i = 0; i < hashes.length; i += CHUNK) {
      const res = await postJson<Record<string, MrVersion>>(`${API}/version_files/update`, { hashes: hashes.slice(i, i + CHUNK), algorithm: 'sha1', loaders: loader.loaders, game_versions: [gv] })
      for (const [hash, v] of Object.entries(res)) out.set(hash, { versionId: v.id, version: v.version_number })
    }
    return out
  },
  infer(files) {
    const loader = mostCommon(files.flatMap((f) => f.loaders.filter((l) => l in LOADERS)))
    const version = mostCommon(files.flatMap((f) => f.gameVersions))
    return loader && version ? { loader, gameVersion: version } : null
  },
  async search(ctx, query, offset) {
    const loader = loaderOf(ctx)
    if (!loader) badRequest('ADDONS_UNSUPPORTED')
    const facets = [[`project_type:${loader.type}`], loader.loaders.map((l) => `categories:${l}`), [`versions:${await gameVersion(ctx)}`], ['server_side:required', 'server_side:optional']]
    const q = new URLSearchParams({ query, facets: JSON.stringify(facets), offset: String(offset), limit: '20', index: query ? 'relevance' : 'downloads' })
    const res = await fetchJson<{ hits: { project_id: string; slug: string; title: string; description: string; author: string; icon_url: string | null; downloads: number; project_type: string }[]; total_hits: number }>(`${API}/search?${q}`)
    return {
      total: res.total_hits,
      items: res.hits.map((h) => ({ id: h.project_id, name: h.title, description: h.description, author: h.author, icon: h.icon_url || null, downloads: h.downloads, url: `https://modrinth.com/${h.project_type}/${h.slug}` })),
    }
  },
  async versions(ctx, projectId): Promise<AddonVersion[]> {
    return (await compatibleVersions(ctx, projectId)).map((v) => ({ id: v.id, name: v.name, version: v.version_number, gameVersions: v.game_versions, loaders: v.loaders, publishedAt: v.date_published }))
  },
  async resolve(ctx, projectId, versionId) {
    const loader = loaderOf(ctx)
    if (!loader) badRequest('ADDONS_UNSUPPORTED')
    const version = versionId ? await fetchJson<MrVersion>(`${API}/version/${encodeURIComponent(versionId)}`) : (await compatibleVersions(ctx, projectId))[0]
    if (!version || version.project_id !== projectId) badRequest('ADDON_NO_VERSION')
    const file = version.files.find((f) => f.primary) ?? version.files[0]
    if (!file) badRequest('ADDON_NO_VERSION')
    const project = await fetchJson<{ title: string }>(`${API}/project/${encodeURIComponent(projectId)}`)
    return {
      projectId,
      versionId: version.id,
      name: project.title,
      version: version.version_number,
      url: file.url,
      fileName: file.filename,
      dir: loader.dir,
      sha1: file.hashes.sha1,
      dependencies: version.dependencies.filter((d) => d.dependency_type === 'required' && d.project_id).map((d) => d.project_id!),
    }
  },
}
