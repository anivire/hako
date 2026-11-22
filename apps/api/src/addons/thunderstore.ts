import fs from 'node:fs/promises'
import path from 'node:path'
import type { AddonEntry, AddonUpdate } from '@hako/shared'
import { unzipSync } from 'fflate'
import { badRequest, fetchJson, notFound } from '../lib/http'
import type { ServerRow } from '../runtime/instances'
import { resolveInside } from '../services/files'
import { download } from './download'
import type { AddonContext, ManagedSource } from './types'

const SITE = 'https://thunderstore.io'
const FULL_NAME = /^([A-Za-z0-9_]+)-([A-Za-z0-9_]+)$/
const DEPENDENCY = /^([A-Za-z0-9_]+-[A-Za-z0-9_]+)-\d+(\.\d+)*$/
const PAGE = 20
const SKIP_FILES = new Set(['readme.md', 'changelog.md', 'license', 'license.md', 'license.txt'])

interface Listed {
  namespace: string
  name: string
  description: string
  icon_url: string | null
  download_count: number
  is_deprecated: boolean
}

interface PackageVersion {
  version_number: string
  description: string
  icon: string
  dependencies: string[]
  download_url: string
  date_created: string
}

interface Manifest {
  name?: string
  version_number?: string
}

function dirs(ctx: AddonContext) {
  const p = ctx.params
  return { plugins: p.dir ?? 'BepInEx/plugins', disabled: p.disabled ?? 'BepInEx/disabled', patchers: p.patchers ?? 'BepInEx/patchers', config: p.config ?? 'BepInEx/config' }
}

function skipped(ctx: AddonContext) {
  return new Set((ctx.params.skip ?? '').split(',').filter(Boolean).map((s) => s.toLowerCase()))
}

function packageUrl(ctx: AddonContext, full: string) {
  const [, ns, name] = FULL_NAME.exec(full) ?? []
  return `${SITE}/c/${ctx.params.community}/p/${ns}/${name}/`
}

async function latest(full: string): Promise<PackageVersion> {
  const [, ns, name] = FULL_NAME.exec(full) ?? badRequest('ADDON_NO_VERSION')
  const pkg = await fetchJson<{ latest: PackageVersion }>(`${SITE}/api/experimental/package/${ns}/${name}/`)
  return pkg.latest
}

async function exists(file: string) {
  return fs.stat(file).then(
    () => true,
    () => false,
  )
}

async function sizeOf(target: string): Promise<number> {
  const stat = await fs.stat(target).catch(() => null)
  if (!stat) return 0
  if (!stat.isDirectory()) return stat.size
  let total = 0
  for (const e of await fs.readdir(target)) total += await sizeOf(path.join(target, e))
  return total
}

export function placeEntry(entry: string, full: string, d: ReturnType<typeof dirs>): string | null {
  const clean = path.posix.normalize(entry.replace(/\\/g, '/')).replace(/^(BepInEx\/)/i, '')
  if (!clean || clean.endsWith('/') || clean.startsWith('..') || path.posix.isAbsolute(clean)) return null
  const [top, ...rest] = clean.split('/')
  const lower = top!.toLowerCase()
  if (!rest.length && SKIP_FILES.has(lower)) return null
  if (lower === 'plugins' && rest.length) return path.posix.join(d.plugins, full, ...rest)
  if (lower === 'patchers' && rest.length) return path.posix.join(d.patchers, full, ...rest)
  if (lower === 'config' && rest.length) return path.posix.join(d.config, ...rest)
  return path.posix.join(d.plugins, full, clean)
}

async function installOne(server: ServerRow, ctx: AddonContext, full: string): Promise<PackageVersion> {
  const version = await latest(full)
  const d = dirs(ctx)
  const files = unzipSync(new Uint8Array(await download(version.download_url)))
  for (const dir of [d.plugins, d.disabled, d.patchers]) await fs.rm(await resolveInside(server.id, path.posix.join(dir, full), false), { recursive: true, force: true })
  for (const [entry, data] of Object.entries(files)) {
    const target = placeEntry(entry, full, d)
    if (!target) continue
    const file = await resolveInside(server.id, target, false)
    if (target.startsWith(`${d.config}/`) && (await exists(file))) continue
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, data)
  }
  return version
}

async function installedNames(server: ServerRow, ctx: AddonContext): Promise<Set<string>> {
  const d = dirs(ctx)
  const out = new Set<string>()
  for (const dir of [d.plugins, d.disabled]) {
    for (const e of await fs.readdir(await resolveInside(server.id, dir), { withFileTypes: true }).catch(() => [])) if (e.isDirectory()) out.add(e.name.toLowerCase())
  }
  return out
}

function entryPath(ctx: AddonContext, relative: string) {
  const d = dirs(ctx)
  const normalized = path.posix.normalize(relative)
  const parent = path.posix.dirname(normalized)
  const name = path.posix.basename(normalized)
  if ((parent !== d.plugins && parent !== d.disabled) || !name || name.startsWith('.')) notFound('ADDON_NOT_FOUND')
  return { parent, name, enabled: parent === d.plugins }
}

export const thunderstore: ManagedSource = {
  id: 'thunderstore',
  name: 'Thunderstore',
  updatable: true,
  async search(ctx, query, offset) {
    const page = Math.floor(offset / PAGE) + 1
    const q = new URLSearchParams({ q: query, page: String(page), ordering: query ? 'top-rated' : 'most-downloaded' })
    const res = await fetchJson<{ count: number; results: Listed[] }>(`${SITE}/api/cyberstorm/listing/${encodeURIComponent(ctx.params.community ?? '')}/?${q}`)
    const skip = skipped(ctx)
    return {
      total: res.count,
      pageSize: PAGE,
      items: res.results
        .filter((r) => !r.is_deprecated && !skip.has(`${r.namespace}-${r.name}`.toLowerCase()) && r.name !== 'r2modman')
        .map((r) => ({
          id: `${r.namespace}-${r.name}`,
          name: r.name.replace(/_/g, ' '),
          description: r.description,
          author: r.namespace,
          icon: r.icon_url,
          downloads: r.download_count,
          url: packageUrl(ctx, `${r.namespace}-${r.name}`),
        })),
    }
  },
  async versions() {
    return []
  },
  async list(server, ctx) {
    const d = dirs(ctx)
    const out: AddonEntry[] = []
    for (const [dir, enabled] of [
      [d.plugins, true],
      [d.disabled, false],
    ] as const) {
      const root = await resolveInside(server.id, dir)
      for (const e of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
        if (e.name.startsWith('.') || (!e.isDirectory() && !/\.dll$/i.test(e.name))) continue
        const full = path.join(root, e.name)
        const manifest = e.isDirectory() ? ((await fs.readFile(path.join(full, 'manifest.json'), 'utf8').then((t) => JSON.parse(t.replace(/^﻿/, '')) as Manifest).catch(() => null)) ?? null) : null
        const known = manifest?.version_number && FULL_NAME.test(e.name)
        out.push({
          path: path.posix.join(dir, e.name),
          fileName: e.name,
          size: await sizeOf(full),
          enabled,
          source: known ? 'thunderstore' : null,
          projectId: known ? e.name : null,
          versionId: known ? manifest.version_number! : null,
          name: (manifest?.name ?? e.name.replace(/\.dll$/i, '')).replace(/_/g, ' '),
          version: manifest?.version_number ?? null,
          icon: known ? `https://gcdn.thunderstore.io/live/repository/icons/${e.name}-${manifest.version_number}.png` : null,
          url: known ? packageUrl(ctx, e.name) : null,
        })
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  },
  async install(server, ctx, projectId) {
    if (!FULL_NAME.test(projectId)) badRequest('ADDON_NO_VERSION')
    const skip = skipped(ctx)
    const present = await installedNames(server, ctx)
    const installed: string[] = []
    const queue = [projectId]
    const seen = new Set<string>()
    while (queue.length) {
      const full = queue.shift()!
      const key = full.toLowerCase()
      if (seen.has(key) || skip.has(key) || (full !== projectId && present.has(key))) continue
      seen.add(key)
      try {
        const version = await installOne(server, ctx, full)
        installed.push(full.split('-')[1]!.replace(/_/g, ' '))
        for (const dep of version.dependencies) {
          const match = DEPENDENCY.exec(dep)
          if (match) queue.push(match[1]!)
        }
      } catch (e) {
        if (full === projectId) throw e
        console.warn(`[hako] dependency ${full} of ${projectId} was not installed: ${e instanceof Error ? e.message : e}`)
      }
    }
    return installed
  },
  async remove(server, ctx, relative) {
    const { parent, name } = entryPath(ctx, relative)
    await fs.rm(await resolveInside(server.id, path.posix.join(parent, name), false), { recursive: true, force: true })
    await fs.rm(await resolveInside(server.id, path.posix.join(dirs(ctx).patchers, name), false), { recursive: true, force: true })
  },
  async setEnabled(server, ctx, relative, enabled) {
    const d = dirs(ctx)
    const entry = entryPath(ctx, relative)
    if (entry.enabled === enabled) return
    const target = await resolveInside(server.id, path.posix.join(enabled ? d.plugins : d.disabled, entry.name), false)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.rm(target, { recursive: true, force: true })
    await fs.rename(await resolveInside(server.id, path.posix.join(entry.parent, entry.name), false), target).catch(() => notFound('ADDON_NOT_FOUND'))
  },
  async checkUpdates(server, ctx) {
    const entries = (await this.list(server, ctx)).filter((e) => e.projectId)
    const out: AddonUpdate[] = []
    for (let i = 0; i < entries.length; i += 8) {
      const batch = entries.slice(i, i + 8)
      const versions = await Promise.all(batch.map((e) => latest(e.projectId!).catch(() => null)))
      batch.forEach((e, j) => {
        const v = versions[j]
        if (v && v.version_number !== e.versionId) out.push({ path: e.path, versionId: v.version_number, version: v.version_number })
      })
    }
    return out
  },
  async update(server, ctx, paths) {
    const d = dirs(ctx)
    const entries = (await this.list(server, ctx)).filter((e) => e.projectId && paths.includes(e.path))
    for (const e of entries) {
      await installOne(server, ctx, e.projectId!)
      if (!e.enabled) await this.setEnabled(server, ctx, path.posix.join(d.plugins, e.fileName), false)
    }
    return entries.length
  },
}
