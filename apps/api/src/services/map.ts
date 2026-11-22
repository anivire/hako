import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { variableVisible } from '@hako/shared'
import { addonsOverview, installAddon, removeAddon } from '../addons/manager'
import { db } from '../db/client'
import { servers } from '../db/schema'
import { env } from '../env'
import { requireGame, serverGame } from '../games/registry'
import { badRequest, notFound } from '../lib/http'
import { type ServerRow, dockerPublishedPorts, hostPortFree, mapProvider, statusOf } from '../runtime/instances'

const STUB = {
  ru: { offline: ['Сервер выключен', 'Карта появится, когда сервер запустят'], waiting: ['Карта пока не отвечает', 'Мод карты запускается или ещё рисует мир. Страница обновится сама'] },
  en: { offline: ['The server is offline', 'The map shows up once the server is started'], waiting: ['The map is not answering yet', 'The map mod is starting or still rendering the world. This page reloads by itself'] },
}

function stub(kind: 'offline' | 'waiting', language: string, status: number) {
  const [title, text] = STUB[language.toLowerCase().startsWith('ru') ? 'ru' : 'en'][kind]
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>${title}</title><style>
:root{color-scheme:light dark;--bg:#f7f1ec;--fg:#2b211b;--muted:#7d6f65;--tile:#ede3db;--warn:#c98a1b}
@media (prefers-color-scheme:dark){:root{--bg:#141009;--fg:#efe7e0;--muted:#a3958a;--tile:#241d17;--warn:#e0a53a}}
html,body{height:100%;margin:0}body{display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
main{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:26rem;padding:24px;text-align:center}
.icon{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:var(--tile);color:var(--warn)}
h1{margin:4px 0 0;font-size:16px;font-weight:600}p{margin:0;color:var(--muted);font-size:14px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--warn);animation:p 1.4s ease-in-out infinite}@keyframes p{50%{opacity:.25}}
</style></head><body><main><div class="icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M2 5l7-3 6 3 6.3-2.7a.5.5 0 0 1 .7.46V19l-7 3-6-3-6.3 2.7a.5.5 0 0 1-.7-.46V5zm13 14.8V7.2l-6-2.6v12.2l6 2.6z"/></svg></div><h1>${title}</h1><p>${text}</p>${kind === 'waiting' ? '<div class="dot"></div>' : ''}</main></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

const DROP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie'])

async function freePort(start: number, self: string): Promise<number> {
  const used = new Set([...db.select({ id: servers.id, ports: servers.ports }).from(servers).all().filter((s) => s.id !== self).flatMap((s) => Object.values(s.ports)), ...(await dockerPublishedPorts())])
  let port = start
  while (port <= 65535 && (used.has(port) || !(await hostPortFree(port, 'tcp')))) port += 1
  if (port > 65535) badRequest('PORT_TAKEN')
  return port
}

async function dropProject(server: ServerRow, project: string) {
  const overview = await addonsOverview(server)
  for (const entry of overview.entries) if (entry.projectId === project) await removeAddon(server, entry.path)
}

export async function setMap(server: ServerRow, id: string | null): Promise<ServerRow> {
  const game = serverGame(server) ?? requireGame(server.game)
  const previous = mapProvider(server, game)
  const next = id ? game.map?.providers.find((p) => p.id === id) : undefined
  if (id && (!next || !variableVisible(next, server.variables))) badRequest('MAP_UNSUPPORTED')
  if (next && next.id !== previous?.id) await installAddon(server, next.source, next.project)
  if (previous && previous.id !== next?.id) await dropProject(server, previous.project)
  const ports = { ...server.ports }
  if (next) ports.map = ports.map && previous?.port === next.port ? ports.map : await freePort(next.port, server.id)
  else delete ports.map
  const variables = { ...server.variables, MAP: next?.id ?? '', MAP_SHARE: next ? (server.variables.MAP_SHARE ?? '') : '' }
  return db.update(servers).set({ variables, ports }).where(eq(servers.id, server.id)).returning().get()!
}

export function setMapShare(server: ServerRow, on: boolean): ServerRow {
  if (!server.variables.MAP) badRequest('MAP_UNSUPPORTED')
  const variables = { ...server.variables, MAP_SHARE: on ? server.variables.MAP_SHARE || randomBytes(18).toString('base64url') : '' }
  return db.update(servers).set({ variables }).where(eq(servers.id, server.id)).returning().get()!
}

export function sharedServer(token: string): ServerRow {
  const row = token.length >= 16 ? db.select().from(servers).all().find((s) => s.variables.MAP_SHARE === token) : undefined
  if (!row) notFound('SERVER_NOT_FOUND')
  return row
}

export async function proxyMap(server: ServerRow, rest: string, search: string, language = ''): Promise<Response> {
  const game = serverGame(server)
  if (!game || !mapProvider(server, game) || !server.ports.map) notFound('PATH_NOT_FOUND')
  const page = rest.replace(/^\/+/, '') === '' || rest.endsWith('.html')
  if (statusOf(server.id) === 'offline') return page ? stub('offline', language, 503) : new Response(null, { status: 503 })
  const res = await fetch(`http://${env.mapHost}:${server.ports.map}/${rest.replace(/^\/+/, '')}${search}`, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
  if (!res) return page ? stub('waiting', language, 502) : new Response(null, { status: 502 })
  const headers = new Headers()
  res.headers.forEach((value, key) => {
    if (!DROP.has(key.toLowerCase())) headers.set(key, value)
  })
  return new Response(res.body, { status: res.status, headers })
}
