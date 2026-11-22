import { eq } from 'drizzle-orm'
import { PlayerTracker } from './players'
import { curseforgeKey } from '../services/settings'
import fs from 'node:fs'
import dgram from 'node:dgram'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import type { Duplex } from 'node:stream'
import Docker from 'dockerode'
import { type ConsoleMessage, type GameTemplate, type PowerAction, type ServerStatus, builtinVariables, variableVisible } from '@hako/shared'
import { db } from '../db/client'
import { servers } from '../db/schema'
import { env } from '../env'
import { autoVariables, containerEnv, interpolate, serverGame } from '../games/registry'

export type ServerRow = typeof servers.$inferSelect
type Listener = (message: ConsoleMessage) => void

const docker = new Docker({ socketPath: env.dockerSocket })
const LABEL = 'hako.server'
const HISTORY_CHARS = 100_000
const instances = new Map<string, Instance>()

export function serverDir(id: string) {
  return path.join(env.serversDir, id)
}

function containerName(id: string) {
  return `hako-${id}`
}

export function mapProvider(server: ServerRow, game: GameTemplate) {
  const id = server.variables.MAP
  return id ? game.map?.providers.find((p) => p.id === id && variableVisible(p, server.variables)) : undefined
}

export function serverPorts(server: ServerRow, game: GameTemplate) {
  const ports = game.ports.map((p) => ({ name: p.name, container: p.container, protocol: p.protocol, host: server.ports[p.name] ?? p.container }))
  const map = mapProvider(server, game)
  return map && server.ports.map ? [...ports, { name: 'map', container: map.port, protocol: 'tcp' as const, host: server.ports.map }] : ports
}

const MAP_MARKER = '.hako-map-rendered'

const ICON_DATA = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/

function iconSource(server: ServerRow, game: GameTemplate) {
  const icon = server.icon ?? game.icon ?? ''
  const data = ICON_DATA.exec(icon)
  if (data) return { file: `.hako-icon.${data[1]}`, data: Buffer.from(data[2]!, 'base64') }
  return icon.startsWith('https://') ? { url: icon } : null
}

function writeIcon(dir: string, server: ServerRow, game: GameTemplate) {
  const icon = iconSource(server, game)
  if (icon?.file) fs.writeFileSync(path.join(dir, icon.file), icon.data)
}

function templateVars(server: ServerRow, game: GameTemplate) {
  const ports = serverPorts(server, game)
  const icon = iconSource(server, game)
  const defaults = Object.fromEntries(game.variables.map((v) => [v.key, v.default]))
  const known = { ...defaults, ...server.variables }
  const missing = Object.fromEntries(game.variables.filter((v) => !(v.key in server.variables)).map((v) => [v.key, variableVisible(v, known) ? v.default : '']))
  const vars: Record<string, string> = {
    ...missing,
    ...server.variables,
    ...builtinVariables(server.memory),
    SERVER_ID: server.id,
    SERVER_NAME: server.name,
    SERVER_PORT: String(ports[0]!.host),
    SERVER_ICON: icon?.url ?? (icon?.file ? `${game.dataPath}/${icon.file}` : ''),
    HAKO_CURSEFORGE_API_KEY: curseforgeKey(),
  }
  for (const p of ports) vars[`SERVER_PORT_${p.name.toUpperCase().replace(/-/g, '_')}`] = String(p.host)
  return autoVariables(game, vars)
}

async function ensureImage(image: string, log: (line: string) => void) {
  try {
    await docker.getImage(image).inspect()
    return
  } catch {}
  log(`[hako] pulling ${image}\r\n`)
  const stream = await docker.pull(image)
  await new Promise<void>((resolve, reject) => docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve())))
  log(`[hako] pulled ${image}\r\n`)
}

function attachSocket(id: string): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      socketPath: env.dockerSocket,
      method: 'POST',
      path: `/containers/${encodeURIComponent(id)}/attach?stream=1&stdin=1&stdout=1&stderr=1`,
      headers: { Connection: 'Upgrade', Upgrade: 'tcp', 'Content-Length': 0 },
    })
    req.on('upgrade', (_res, socket, head) => {
      if (head.length) socket.unshift(head)
      resolve(socket)
    })
    req.on('response', (res) => {
      res.resume()
      reject(new Error(`attach failed with ${res.statusCode}`))
    })
    req.on('error', reject)
    req.end()
  })
}

async function removeContainer(id: string) {
  try {
    await docker.getContainer(containerName(id)).remove({ force: true })
  } catch {}
}

class Instance {
  status: ServerStatus = 'offline'
  startedAt: string | null = null
  private history = ''
  private tail = ''
  private listeners = new Set<Listener>()
  private stdin: Duplex | null = null
  private stats: NodeJS.ReadableStream | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private ready: RegExp | null = null
  private exited: Promise<void> = Promise.resolve()
  private game: GameTemplate | null = null
  private versionTail = ''
  private players: PlayerTracker | null = null

  private render: { id: string; command: string } | null = null
  private cpuCores: number | null = null

  constructor(readonly id: string) {}

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener({ type: 'history', data: this.history })
    listener({ type: 'status', status: this.status, startedAt: this.startedAt })
    if (this.players) listener({ type: 'players', players: this.players.list })
    this.syncStats()
    return () => {
      this.listeners.delete(listener)
      this.syncStats()
    }
  }

  power(action: PowerAction, server: ServerRow) {
    if (action === 'kill') return this.kill()
    const run = () => (action === 'start' ? this.start(server) : action === 'stop' ? this.stop(server) : this.stop(server).then(() => this.start(server)))
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }

  command(text: string) {
    if (this.status === 'offline') return false
    const exec = this.game?.console.exec
    if (exec) {
      docker
        .getContainer(containerName(this.id))
        .exec({ Cmd: [...exec, text] })
        .then((e) => e.start({ Detach: true }))
        .catch((e) => this.log(`\r\n[hako] command failed: ${e instanceof Error ? e.message : e}\r\n`))
      return true
    }
    if (!this.stdin) return false
    this.stdin.write(`${text}\n`)
    return true
  }

  async destroy() {
    await this.kill()
    await removeContainer(this.id)
    instances.delete(this.id)
  }

  replayPlayers() {
    this.players?.feed(this.history)
  }

  async loadHistory(container: Docker.Container) {
    try {
      const logs = (await container.logs({ stdout: true, stderr: true, tail: 2000, follow: false })) as Buffer
      this.history = logs.toString('utf8').slice(-HISTORY_CHARS)
    } catch {}
  }

  async adopt(container: Docker.Container) {
    this.ready = null
    try {
      const info = await container.inspect()
      this.startedAt = info.State.StartedAt || null
      this.cpuCores = info.HostConfig.NanoCpus ? info.HostConfig.NanoCpus / 1e9 : null
    } catch {}
    this.setStatus('running')
    await this.attach(container)
    this.watchExit(container)
  }

  private emit(message: ConsoleMessage) {
    for (const listener of this.listeners) listener(message)
  }

  useGame(game: GameTemplate | undefined) {
    this.game = game ?? null
    this.players = game?.console.players ? new PlayerTracker(game.console.players) : null
  }

  private setStatus(status: ServerStatus) {
    if (this.status === status) return
    if (status === 'offline' && this.players?.list.length) {
      this.players.reset()
      this.emit({ type: 'players', players: [] })
    }
    if (status === 'offline') this.startedAt = null
    else if (this.status === 'offline' && !this.startedAt) this.startedAt = new Date().toISOString()
    this.status = status
    this.emit({ type: 'status', status, startedAt: this.startedAt })
    this.syncStats()
  }

  private log = (data: string) => {
    this.history = (this.history + data).slice(-HISTORY_CHARS)
    this.emit({ type: 'log', data })
    if (this.players?.feed(data)) this.emit({ type: 'players', players: this.players.list })
    const pattern = this.game?.console.version
    if (pattern && this.status === 'starting') {
      this.versionTail = (this.versionTail + data).slice(-4096)
      const found = new RegExp(pattern).exec(this.versionTail)?.[1]
      if (found && found !== versionOf(this.id)) {
        versions.set(this.id, found)
        fs.writeFile(path.join(serverDir(this.id), VERSION_FILE), found, () => {})
      }
    }
    if (this.status === 'starting' && this.ready) {
      this.tail = (this.tail + data).slice(-4096)
      if (this.ready.test(this.tail)) {
        this.tail = ''
        this.setStatus('running')
        const render = this.render
        this.render = null
        if (render)
          setTimeout(() => {
            if (this.status === 'running' && this.command(render.command)) fs.writeFile(path.join(serverDir(this.id), MAP_MARKER), render.id, () => {})
          }, 5000)
      }
    }
  }

  private async attach(container: Docker.Container) {
    const stream = await attachSocket(container.id)
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => this.log(chunk))
    stream.on('error', () => {})
    this.stdin = stream
  }

  private watchExit(container: Docker.Container) {
    this.exited = container
      .wait()
      .then((result: { StatusCode?: number }) => this.log(`\r\n[hako] server stopped with code ${result.StatusCode ?? '?'}\r\n`))
      .catch(() => {})
      .finally(() => {
        this.stdin?.destroy()
        this.stdin = null
        this.setStatus('offline')
      })
  }

  private async start(server: ServerRow) {
    if (this.status !== 'offline') return
    const game = serverGame(server)
    if (!game) throw new Error('GAME_UNKNOWN')
    this.setStatus('starting')
    this.useGame(game)
    try {
      const vars = templateVars(server, game)
      const image = interpolate(game.image, vars)
      const ports = serverPorts(server, game)
      const dir = serverDir(server.id)
      fs.mkdirSync(dir, { recursive: true })
      for (const v of game.volumes) fs.mkdirSync(path.join(dir, v.folder), { recursive: true })
      writeIcon(dir, server, game)
      for (const f of [...game.files, ...(mapProvider(server, game)?.files ?? [])]) {
        if (!variableVisible(f, server.variables)) continue
        const file = path.join(dir, f.path)
        if (!file.startsWith(dir + path.sep)) continue
        const exists = fs.existsSync(file)
        if (f.content !== undefined || (!exists && f.create !== undefined)) {
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.writeFileSync(file, interpolate(f.content ?? f.create!, vars))
        } else if (exists) {
          const text = fs.readFileSync(file, 'utf8')
          const next = f.replace.reduce((t, [from, to]) => t.replaceAll(from, interpolate(to, vars)), text)
          if (next !== text) fs.writeFileSync(file, next)
        }
      }
      for (const c of game.configs) {
        if (!c.seed || !c.defaults) continue
        const file = path.join(dir, c.path)
        if (fs.existsSync(file)) continue
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, c.defaults)
      }
      await ensureImage(image, this.log)
      await removeContainer(server.id)
      for (const p of ports) {
        if (!(await hostPortFree(p.host, p.protocol))) throw new Error(`port ${p.host}/${p.protocol} is used by another program`)
      }
      const memory = server.memory * 1024 * 1024
      const container = await docker.createContainer({
        name: containerName(server.id),
        Image: image,
        Cmd: game.command?.length ? game.command.map((part) => interpolate(part, vars)) : undefined,
        Env: containerEnv(game, vars),
        Tty: true,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        StdinOnce: false,
        Labels: { [LABEL]: server.id, 'hako.game': game.id },
        Healthcheck: game.healthcheck ? undefined : { Test: ['NONE'] },
        ExposedPorts: Object.fromEntries(ports.map((p) => [`${p.container}/${p.protocol}`, {}])),
        HostConfig: {
          Binds: [`${dir}:${game.dataPath}`, ...game.volumes.map((v) => `${path.join(dir, v.folder)}:${v.path}`)],
          PortBindings: Object.fromEntries(ports.map((p) => [`${p.container}/${p.protocol}`, [{ HostPort: String(p.host) }]])),
          Memory: memory,
          MemorySwap: memory,
          NanoCpus: server.cpu ? Math.round(server.cpu * 1e9) : undefined,
          RestartPolicy: { Name: 'no' },
        },
      })
      this.ready = game.console.ready ? new RegExp(game.console.ready) : null
      this.cpuCores = server.cpu ?? null
      const map = mapProvider(server, game)
      const rendered = (() => {
        try {
          return fs.readFileSync(path.join(dir, MAP_MARKER), 'utf8')
        } catch {
          return ''
        }
      })()
      this.render = map?.render && rendered !== map.id ? { id: map.id, command: map.render } : null
      this.tail = ''
      this.versionTail = ''
      await this.attach(container)
      await container.start()
      this.watchExit(container)
      if (!this.ready) this.setStatus('running')
    } catch (e) {
      this.log(`\r\n[hako] failed to start: ${e instanceof Error ? e.message : e}\r\n`)
      this.stdin?.destroy()
      this.stdin = null
      this.setStatus('offline')
      throw e
    }
  }

  private async stop(server: ServerRow) {
    if (this.status === 'offline') return
    const game = serverGame(server)
    const timeout = game?.stop.timeout ?? 60
    this.setStatus('stopping')
    const container = docker.getContainer(containerName(server.id))
    if (game?.stop.command && this.command(game.stop.command)) {
      const done = await Promise.race([this.exited.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), timeout * 1000))])
      if (done) return
    }
    try {
      await container.stop({ t: timeout })
    } catch {}
    await this.exited
  }

  private async kill() {
    if (this.status === 'offline') return
    try {
      await docker.getContainer(containerName(this.id)).kill()
    } catch {}
    await this.exited
  }

  private syncStats() {
    const want = this.listeners.size > 0 && this.status !== 'offline'
    if (want && !this.stats) void this.openStats()
    if (!want && this.stats) {
      ;(this.stats as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
      this.stats = null
    }
  }

  private async openStats() {
    try {
      const stream = (await docker.getContainer(containerName(this.id)).stats({ stream: true })) as NodeJS.ReadableStream
      this.stats = stream
      let buffer = ''
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let nl
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          if (line.trim()) this.emitStats(JSON.parse(line) as Docker.ContainerStats)
        }
      })
      stream.on('error', () => {})
      stream.on('end', () => {
        if (this.stats === stream) this.stats = null
      })
      if (!(this.listeners.size > 0 && this.status !== 'offline')) this.syncStats()
    } catch {
      this.stats = null
    }
  }

  private emitStats(s: Docker.ContainerStats) {
    const cpuDelta = s.cpu_stats.cpu_usage.total_usage - (s.precpu_stats.cpu_usage?.total_usage ?? 0)
    const systemDelta = (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0)
    const cpus = s.cpu_stats.online_cpus ?? s.cpu_stats.cpu_usage.percpu_usage?.length ?? 1
    const cpu = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cpus * 100 : 0
    const cpuLimit = this.cpuCores ?? cpus
    const cache = (s.memory_stats.stats as Record<string, number> | undefined)?.inactive_file ?? 0
    const nets = Object.values(s.networks ?? {})
    const rx = nets.reduce((sum, n) => sum + n.rx_bytes, 0)
    const tx = nets.reduce((sum, n) => sum + n.tx_bytes, 0)
    this.emit({ type: 'stats', stats: { at: Date.now(), cpu, memory: Math.max(0, (s.memory_stats.usage ?? 0) - cache), memoryLimit: s.memory_stats.limit ?? 0, cpuLimit, rx, tx } })
  }
}

export interface QuickStats {
  cpu: number
  cpuLimit: number
  memory: number
  memoryLimit: number
}

const quick = new Map<string, { at: number; value: Promise<QuickStats | null> }>()

export function quickStats(id: string, cores: number | null): Promise<QuickStats | null> {
  const hit = quick.get(id)
  if (hit && Date.now() - hit.at < 4000) return hit.value
  const value = (async () => {
    try {
      const s = (await docker.getContainer(containerName(id)).stats({ stream: false })) as Docker.ContainerStats
      const cpuDelta = s.cpu_stats.cpu_usage.total_usage - (s.precpu_stats.cpu_usage?.total_usage ?? 0)
      const systemDelta = (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0)
      const cpus = s.cpu_stats.online_cpus ?? s.cpu_stats.cpu_usage.percpu_usage?.length ?? 1
      const cache = (s.memory_stats.stats as Record<string, number> | undefined)?.inactive_file ?? 0
      return {
        cpu: systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cpus * 100 : 0,
        cpuLimit: cores ?? cpus,
        memory: Math.max(0, (s.memory_stats.usage ?? 0) - cache),
        memoryLimit: s.memory_stats.limit ?? 0,
      }
    } catch {
      return null
    }
  })()
  quick.set(id, { at: Date.now(), value })
  return value
}

export function instance(id: string): Instance {
  let found = instances.get(id)
  if (!found) {
    found = new Instance(id)
    instances.set(id, found)
  }
  return found
}

const VERSION_FILE = '.hako-version'
const versions = new Map<string, string | null>()

export function versionOf(id: string): string | null {
  if (!versions.has(id)) {
    let value: string | null = null
    try {
      value = fs.readFileSync(path.join(serverDir(id), VERSION_FILE), 'utf8').trim().slice(0, 64) || null
    } catch {}
    versions.set(id, value)
  }
  return versions.get(id) ?? null
}

export function statusOf(id: string): ServerStatus {
  return instances.get(id)?.status ?? 'offline'
}

export function startedAtOf(id: string): string | null {
  return instances.get(id)?.startedAt ?? null
}

export async function runningCommand(id: string): Promise<string | null> {
  try {
    const top = (await docker.getContainer(containerName(id)).top()) as { Titles: string[]; Processes: string[][] }
    const column = Math.max(0, top.Titles.length - 1)
    return top.Processes.map((p) => p[column] ?? '').find((cmd) => /(^|\/)java\s/.test(cmd)) ?? null
  } catch {
    return null
  }
}

export async function dockerPublishedPorts(): Promise<Set<number>> {
  try {
    const containers = await docker.listContainers()
    return new Set(containers.flatMap((c) => c.Ports.map((p) => p.PublicPort).filter((p): p is number => Boolean(p))))
  } catch {
    return new Set()
  }
}

export function hostPortFree(port: number, protocol: 'tcp' | 'udp'): Promise<boolean> {
  return new Promise((resolve) => {
    if (protocol === 'udp') {
      const socket = dgram.createSocket('udp4')
      socket.once('error', () => resolve(false))
      socket.bind(port, '0.0.0.0', () => socket.close(() => resolve(true)))
      return
    }
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)))
  })
}

let resources: { at: number; value: { cpus: number | null; memory: number | null } } | null = null

export async function dockerResources(): Promise<{ cpus: number | null; memory: number | null }> {
  if (resources && Date.now() - resources.at < 60_000) return resources.value
  try {
    const info = (await docker.info()) as { NCPU?: number; MemTotal?: number }
    const value = { cpus: info.NCPU ?? null, memory: info.MemTotal ? Math.floor(info.MemTotal / 1024 / 1024) : null }
    resources = { at: Date.now(), value }
    return value
  } catch {
    return { cpus: null, memory: null }
  }
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    await docker.ping()
    return true
  } catch {
    return false
  }
}

export async function recoverInstances() {
  try {
    const containers = await docker.listContainers({ all: true, filters: { label: [LABEL] } })
    const known = new Set(db.select({ id: servers.id }).from(servers).all().map((s) => s.id))
    for (const info of containers) {
      const id = info.Labels[LABEL]
      if (!id || !known.has(id)) continue
      const container = docker.getContainer(info.Id)
      const row = db.select().from(servers).where(eq(servers.id, id)).get()
      const target = instance(id)
      target.useGame(row ? serverGame(row) : undefined)
      await target.loadHistory(container)
      if (info.State === 'running') {
        target.replayPlayers()
        await target.adopt(container)
      }
    }
  } catch (e) {
    console.error(`[hako] docker is unavailable at ${env.dockerSocket}: ${e instanceof Error ? e.message : e}`)
  }
}
