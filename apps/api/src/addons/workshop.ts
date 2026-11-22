import fs from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import type { AddonEntry } from '@hako/shared'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/client'
import { servers } from '../db/schema'
import { env } from '../env'
import { badRequest, notFound } from '../lib/http'
import type { ServerRow } from '../runtime/instances'
import { resolveInside } from '../services/files'
import type { AddonContext, ManagedSource } from './types'

const DETAILS = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/'
const ID = /^\d{1,20}$/
const PAGE = 30

interface Details {
  publishedfileid: string
  result: number
  consumer_app_id?: number
  title?: string
  description?: string
  preview_url?: string
  file_size?: string
  subscriptions?: number
  time_updated?: number
}

const cache = new Map<string, { at: number; value: Details }>()

async function details(ids: string[]): Promise<Map<string, Details>> {
  const out = new Map<string, Details>()
  const missing = ids.filter((id) => {
    const hit = cache.get(id)
    if (hit && Date.now() - hit.at < 600_000) out.set(id, hit.value)
    return !out.has(id)
  })
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100)
    const body = new URLSearchParams({ itemcount: String(chunk.length) })
    chunk.forEach((id, j) => body.set(`publishedfileids[${j}]`, id))
    const res = await fetch(DETAILS, { method: 'POST', body, headers: { 'User-Agent': env.userAgent }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
    const json = (await res.json()) as { response: { publishedfiledetails?: Details[] } }
    for (const d of json.response.publishedfiledetails ?? []) {
      if (d.result !== 1) continue
      cache.set(d.publishedfileid, { at: Date.now(), value: d })
      out.set(d.publishedfileid, d)
    }
  }
  return out
}

export function parseIds(html: string): string[] {
  return [...new Set([...html.matchAll(/sharedfiles\/filedetails\/\?id=(\d{1,20})/g)].map((m) => m[1]!))]
}

function plain(text = '') {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

function lists(server: ServerRow, ctx: AddonContext) {
  const read = (key?: string) => (key ? (server.variables[key] ?? '').split(',').filter((id) => ID.test(id)) : [])
  return { all: read(ctx.params.all), enabled: read(ctx.params.enabled) }
}

async function save(server: ServerRow, ctx: AddonContext, all: string[], enabled: string[]) {
  const unique = [...new Set(all)]
  const on = unique.filter((id) => enabled.includes(id))
  const variables = { ...server.variables, [ctx.params.all!]: unique.join(','), [ctx.params.enabled!]: on.join(',') }
  db.update(servers).set({ variables }).where(eq(servers.id, server.id)).run()
  server.variables = variables
  if (!on.length && ctx.params.enabledFile) await fs.rm(await resolveInside(server.id, ctx.params.enabledFile, false), { force: true })
}

function url(id: string) {
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`
}

export const workshop: ManagedSource = {
  id: 'workshop',
  name: 'Steam Workshop',
  updatable: false,
  async search(ctx, query, offset) {
    const appId = ctx.params.appId ?? ''
    const q = new URLSearchParams({ appid: appId, section: 'readytouseitems', p: String(Math.floor(offset / PAGE) + 1), ...(query ? { searchtext: query, browsesort: 'textsearch', actualsort: 'textsearch' } : { browsesort: 'totaluniquesubscribers', actualsort: 'totaluniquesubscribers' }) })
    const res = await fetch(`https://steamcommunity.com/workshop/browse/?${q}`, { headers: { 'User-Agent': env.userAgent, 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
    const ids = parseIds(await res.text()).slice(0, PAGE)
    const found = await details(ids)
    const items = ids.flatMap((id) => {
      const d = found.get(id)
      if (!d || String(d.consumer_app_id) !== appId) return []
      return [{ id, name: d.title ?? id, description: plain(d.description), author: '', icon: d.preview_url || null, downloads: d.subscriptions ?? 0, url: url(id) }]
    })
    return { items, total: offset + items.length + (ids.length >= PAGE ? PAGE : 0) }
  },
  async versions() {
    return []
  },
  async list(server, ctx) {
    const { all, enabled } = lists(server, ctx)
    const found = await details(all).catch(() => new Map<string, Details>())
    return all.map((id): AddonEntry => {
      const d = found.get(id)
      return {
        path: id,
        fileName: id,
        size: Number(d?.file_size ?? 0),
        enabled: enabled.includes(id),
        source: 'workshop',
        projectId: id,
        versionId: null,
        name: d?.title ?? id,
        version: d?.time_updated ? new Date(d.time_updated * 1000).toISOString().slice(0, 10) : null,
        icon: d?.preview_url || null,
        url: url(id),
      }
    })
  },
  async install(server, ctx, projectId) {
    if (!ID.test(projectId)) badRequest('ADDON_NO_VERSION')
    const d = (await details([projectId])).get(projectId)
    if (!d || String(d.consumer_app_id) !== ctx.params.appId) badRequest('ADDON_NO_VERSION')
    const { all, enabled } = lists(server, ctx)
    await save(server, ctx, [...all, projectId], [...enabled, projectId])
    return [d.title ?? projectId]
  },
  async remove(server, ctx, id) {
    const { all, enabled } = lists(server, ctx)
    if (!all.includes(id)) notFound('ADDON_NOT_FOUND')
    await save(
      server,
      ctx,
      all.filter((x) => x !== id),
      enabled,
    )
  },
  async setEnabled(server, ctx, id, on) {
    const { all, enabled } = lists(server, ctx)
    if (!all.includes(id)) notFound('ADDON_NOT_FOUND')
    await save(server, ctx, all, on ? [...enabled, id] : enabled.filter((x) => x !== id))
  },
  async checkUpdates() {
    return []
  },
  async update() {
    return 0
  },
}
