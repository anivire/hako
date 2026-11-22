import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import { Zip, ZipPassThrough, unzipSync } from 'fflate'
import { type World, type WorldsOverview, type WorldsSpec, parseProperties, updateProperties } from '@hako/shared'
import { db } from '../db/client'
import { servers } from '../db/schema'
import { serverGame } from '../games/registry'
import { badRequest, notFound } from '../lib/http'
import { type ServerRow, serverDir, statusOf } from '../runtime/instances'
import { resolveInside } from './files'

const NAME = /^(?! )[\p{L}\p{N}_.\- ]{1,64}(?<! )$/u

function spec(server: ServerRow): WorldsSpec {
  const worlds = serverGame(server)?.worlds
  if (!worlds) badRequest('WORLDS_UNSUPPORTED')
  return worlds
}

function checkName(name: string) {
  if (!NAME.test(name) || name === '.' || name === '..') badRequest('WORLD_NAME_INVALID')
}

const fill = (template: string, name: string) => template.replaceAll('{{NAME}}', name)
const exists = (target: string) => fs.lstat(target).then(() => true, () => false)

export function entryParts(entry: string) {
  const segments = entry.split('/')
  const index = segments.findIndex((s) => s.includes('{{NAME}}'))
  const [before = '', after = ''] = segments[index]!.split('{{NAME}}')
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return { base: segments.slice(0, index).join('/'), match: new RegExp(`^${escape(before)}(.+)${escape(after)}$`), rest: segments.slice(index + 1).join('/') }
}

async function readCurrent(server: ServerRow, worlds: WorldsSpec): Promise<string> {
  if (worlds.variable) return server.variables[worlds.variable] || serverGame(server)?.variables.find((v) => v.key === worlds.variable)?.default || ''
  if (!worlds.property) return ''
  const text = await fs.readFile(await resolveInside(server.id, worlds.property.config), 'utf8').catch(() => '')
  return parseProperties(text)[worlds.property.key] || worlds.property.default
}

async function size(target: string): Promise<{ bytes: number; modified: number }> {
  const stat = await fs.lstat(target).catch(() => null)
  if (!stat) return { bytes: 0, modified: 0 }
  if (!stat.isDirectory()) return { bytes: stat.size, modified: stat.mtimeMs }
  let bytes = 0
  let modified = stat.mtimeMs
  for (const entry of await fs.readdir(target)) {
    const inner = await size(path.join(target, entry))
    bytes += inner.bytes
    modified = Math.max(modified, inner.modified)
  }
  return { bytes, modified }
}

async function worldFiles(server: ServerRow, worlds: WorldsSpec, name: string): Promise<string[]> {
  const out: string[] = []
  for (const p of worlds.paths) {
    const relative = fill(p, name)
    if (await exists(await resolveInside(server.id, relative, false))) out.push(relative)
  }
  return out
}

export async function listWorlds(server: ServerRow): Promise<WorldsOverview> {
  const worlds = spec(server)
  const { base, match, rest } = entryParts(worlds.entry)
  const current = await readCurrent(server, worlds)
  const folder = await resolveInside(server.id, base)
  const list: World[] = []
  for (const entry of await fs.readdir(folder).catch(() => [] as string[])) {
    const name = match.exec(entry)?.[1]
    if (!name || !NAME.test(name) || (rest && !(await exists(path.join(folder, entry, rest))))) continue
    let bytes = 0
    let modified = 0
    for (const file of await worldFiles(server, worlds, name)) {
      const s = await size(path.join(serverDir(server.id), file))
      bytes += s.bytes
      modified = Math.max(modified, s.modified)
    }
    list.push({ name, size: bytes, modifiedAt: modified ? new Date(modified).toISOString() : null, current: name === current })
  }
  list.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name))
  return { worlds: list, current, offline: statusOf(server.id) === 'offline' }
}

export async function selectWorld(server: ServerRow, name: string) {
  const worlds = spec(server)
  checkName(name)
  if (worlds.variable) {
    const variable = serverGame(server)?.variables.find((v) => v.key === worlds.variable)
    if (variable?.pattern && !new RegExp(variable.pattern).test(name)) badRequest('WORLD_NAME_INVALID')
    const variables = { ...server.variables, [worlds.variable]: name }
    db.update(servers).set({ variables }).where(eq(servers.id, server.id)).run()
    server.variables = variables
  } else if (worlds.property) {
    const config = worlds.property.config
    const file = await resolveInside(server.id, config, false)
    const text = await fs.readFile(file, 'utf8').catch(() => serverGame(server)?.configs.find((c) => c.path === config)?.defaults ?? '')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, updateProperties(text, { [worlds.property.key]: name }))
  }
  return listWorlds(server)
}

function requireOffline(server: ServerRow) {
  if (statusOf(server.id) !== 'offline') badRequest('SERVER_RUNNING')
}

export async function deleteWorld(server: ServerRow, name: string) {
  const worlds = spec(server)
  checkName(name)
  requireOffline(server)
  if (name === (await readCurrent(server, worlds))) badRequest('WORLD_IS_CURRENT')
  for (const file of await worldFiles(server, worlds, name)) await fs.rm(await resolveInside(server.id, file, false), { recursive: true, force: true })
  return listWorlds(server)
}

async function* walk(root: string, relative: string): AsyncGenerator<string> {
  const stat = await fs.lstat(path.join(root, relative))
  if (stat.isSymbolicLink()) return
  if (!stat.isDirectory()) {
    yield relative
    return
  }
  for (const entry of await fs.readdir(path.join(root, relative))) yield* walk(root, `${relative}/${entry}`)
}

export async function downloadWorld(server: ServerRow, name: string): Promise<Response> {
  const worlds = spec(server)
  checkName(name)
  const files = await worldFiles(server, worlds, name)
  if (!files.length) notFound('PATH_NOT_FOUND')
  const root = serverDir(server.id)
  const single = files.length === 1 && (await fs.lstat(path.join(root, files[0]!))).isFile()
  if (single) {
    const file = path.join(root, files[0]!)
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}` } })
  }
  // shortcut: fflate writes no Zip64, so a world over 4 GB breaks the archive; switch to tar.gz if that ever matters
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err)
        controller.enqueue(chunk)
        if (final) controller.close()
      })
      try {
        for (const file of files) {
          for await (const relative of walk(root, file)) {
            const entry = new ZipPassThrough(relative)
            zip.add(entry)
            for await (const chunk of createReadStream(path.join(root, relative))) entry.push(chunk as Uint8Array)
            entry.push(new Uint8Array(0), true)
          }
        }
        zip.end()
      } catch (e) {
        controller.error(e)
      }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip` } })
}

export async function uploadWorld(server: ServerRow, fileName: string, data: Uint8Array) {
  const worlds = spec(server)
  requireOffline(server)
  const { base, match, rest } = entryParts(worlds.entry)
  const plain = path.basename(fileName.replace(/\\/g, '/'))
  const at = (relative: string) => resolveInside(server.id, relative, false)
  if (!rest && match.test(plain)) {
    checkName(match.exec(plain)![1]!)
    const target = await at(base ? `${base}/${plain}` : plain)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
    return listWorlds(server)
  }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(data)
  } catch {
    badRequest('WORLD_ARCHIVE_INVALID')
  }
  const names = Object.keys(files).filter((n) => !n.endsWith('/'))
  if (!names.length) badRequest('WORLD_ARCHIVE_INVALID')
  const fromRoot = base !== '' && names.every((n) => n.startsWith(`${base}/`))
  const loose = rest !== '' && names.includes(rest)
  const stem = plain.replace(/\.zip$/i, '')
  if (loose) checkName(stem)
  const prefix = fromRoot ? '' : [base, loose ? stem : ''].filter(Boolean).join('/')
  for (const name of names) {
    const target = await at(prefix ? `${prefix}/${name}` : name)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, files[name]!)
  }
  return listWorlds(server)
}
