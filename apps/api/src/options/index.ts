import { curseforgeKey } from '../services/settings'
import type { VariableOption } from '@hako/shared'
import { HTTPException } from 'hono/http-exception'
import { env } from '../env'
import { badRequest, fetchJson } from '../lib/http'

type OptionSource = (params: Record<string, string>, query: string) => Promise<VariableOption[]>

const MODRINTH = 'https://api.modrinth.com/v2'
const CURSEFORGE = 'https://api.curseforge.com/v1'
const CF_MINECRAFT = 432
const CF_MODPACKS = 4471
const TTL = 10 * 60_000
const LATEST = { ru: 'Последняя', en: 'Latest' }

const cache = new Map<string, { at: number; value: Promise<unknown> }>()

function cachedJson<T>(url: string, load: (url: string) => Promise<T> = fetchJson): Promise<T> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL) return hit.value as Promise<T>
  const value = load(url)
  cache.set(url, { at: Date.now(), value })
  value.catch(() => cache.delete(url))
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  return value
}

async function curseforgeJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'x-api-key': curseforgeKey(), Accept: 'application/json', 'User-Agent': env.userAgent }, signal: AbortSignal.timeout(15_000) })
  if (res.status === 401 || res.status === 403) throw new HTTPException(502, { message: 'CURSEFORGE_KEY_INVALID' })
  if (!res.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
  return (await res.json()) as T
}

function curseforge<T>(path: string) {
  if (!curseforgeKey()) badRequest('CURSEFORGE_KEY_MISSING')
  return cachedJson<T>(`${CURSEFORGE}${path}`, curseforgeJson)
}

const compact = new Intl.NumberFormat('en', { notation: 'compact' })

const SOURCES: Record<string, OptionSource> = {
  async 'minecraft-versions'(params) {
    const tags = await cachedJson<{ version: string; version_type: string }[]>(`${MODRINTH}/tag/game_version`)
    const allowed = ['release', ...(params.snapshots === 'true' ? ['snapshot'] : []), ...(params.betas === 'true' ? ['beta'] : [])]
    const list = tags.filter((t) => allowed.includes(t.version_type))
    const latest = tags.find((t) => t.version_type === 'release')?.version
    return [{ value: 'LATEST', label: LATEST, hint: latest }, ...list.map((t) => ({ value: t.version, label: t.version, hint: t.version_type === 'release' ? undefined : t.version_type }))]
  },
  async 'modrinth-modpacks'(_params, query) {
    const q = new URLSearchParams({ query, facets: JSON.stringify([['project_type:modpack'], ['server_side:required', 'server_side:optional']]), limit: '20', index: query ? 'relevance' : 'downloads' })
    const res = await cachedJson<{ hits: { slug: string; title: string; author: string; icon_url: string | null; downloads: number; versions: string[] }[] }>(`${MODRINTH}/search?${q}`)
    return res.hits.map((h) => ({ value: h.slug, label: h.title, hint: `${h.author} · ${compact.format(h.downloads)} · ${h.versions.at(-1) ?? ''}`, icon: h.icon_url || null }))
  },
  async 'modrinth-versions'(params) {
    if (!params.project) return []
    const versions = await cachedJson<{ id: string; version_number: string; game_versions: string[]; loaders: string[] }[]>(`${MODRINTH}/project/${encodeURIComponent(params.project)}/version`)
    return [{ value: '', label: LATEST, hint: versions[0]?.version_number }, ...versions.map((v) => ({ value: v.id, label: v.version_number, hint: `${v.game_versions.join(', ')} · ${v.loaders.join(', ')}` }))]
  },
  async 'curseforge-modpacks'(_params, query) {
    const q = new URLSearchParams({ gameId: String(CF_MINECRAFT), classId: String(CF_MODPACKS), searchFilter: query, sortField: '2', sortOrder: 'desc', pageSize: '20' })
    const res = await curseforge<{ data: { slug: string; name: string; downloadCount: number; logo: { thumbnailUrl: string } | null; authors: { name: string }[] }[] }>(`/mods/search?${q}`)
    return res.data.map((m) => ({ value: m.slug, label: m.name, hint: `${m.authors[0]?.name ?? ''} · ${compact.format(m.downloadCount)}`, icon: m.logo?.thumbnailUrl ?? null }))
  },
  async 'curseforge-files'(params) {
    if (!params.project) return []
    const found = await curseforge<{ data: { id: number }[] }>(`/mods/search?${new URLSearchParams({ gameId: String(CF_MINECRAFT), classId: String(CF_MODPACKS), slug: params.project })}`)
    const id = found.data[0]?.id
    if (!id) return []
    const files = await curseforge<{ data: { id: number; displayName: string; gameVersions: string[] }[] }>(`/mods/${id}/files?pageSize=50`)
    return [{ value: '', label: LATEST, hint: files.data[0]?.displayName }, ...files.data.map((f) => ({ value: String(f.id), label: f.displayName, hint: f.gameVersions.join(', ') }))]
  },
}

export function optionSource(id: string): OptionSource {
  const source = SOURCES[id]
  if (!source) badRequest('OPTIONS_UNKNOWN')
  return source
}
