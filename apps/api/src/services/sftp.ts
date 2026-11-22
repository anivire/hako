import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import ssh2, { type Attributes, type SFTPWrapper } from 'ssh2'
import { db } from '../db/client'
import { servers, users } from '../db/schema'
import { env } from '../env'
import { allows, accessOf } from '../lib/access'
import { checkLoginRate, resetLoginRate } from '../lib/auth'
import { verifyPassword } from '../lib/crypto'
import { resolveInside } from './files'

const { STATUS_CODE } = ssh2.utils.sftp

type Handle = { kind: 'file'; fd: number } | { kind: 'dir'; dir: string; done: boolean }

function hostKey(): Buffer {
  const file = path.join(env.dataDir, 'sftp_host_key')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(env.dataDir, { recursive: true })
    fs.writeFileSync(file, ssh2.utils.generateKeyPairSync('ed25519').private, { mode: 0o600 })
  }
  return fs.readFileSync(file)
}

export function sftpLogin(login: string): { username: string; serverId: string } | null {
  const dot = login.lastIndexOf('.')
  if (dot <= 0 || dot === login.length - 1) return null
  return { username: login.slice(0, dot), serverId: login.slice(dot + 1) }
}

async function authorize(login: string, password: string, ip: string): Promise<string | null> {
  const parsed = sftpLogin(login)
  if (!parsed) return null
  try {
    checkLoginRate(ip, parsed.username)
  } catch {
    return null
  }
  const user = db.select().from(users).where(eq(users.username, parsed.username)).get()
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null
  resetLoginRate(ip, parsed.username)
  const server = db.select().from(servers).where(eq(servers.id, parsed.serverId)).get()
  const access = server ? accessOf(server, user) : null
  return server && access && allows(access, 'files') ? server.id : null
}

function attrs(stat: fs.Stats): Attributes {
  return { mode: stat.mode, uid: 0, gid: 0, size: stat.size, atime: Math.floor(stat.atimeMs / 1000), mtime: Math.floor(stat.mtimeMs / 1000) }
}

function longname(name: string, stat: fs.Stats) {
  const type = stat.isDirectory() ? 'd' : '-'
  const perms = [6, 3, 0].map((shift) => ['r', 'w', 'x'].map((c, i) => (stat.mode & (1 << (shift + 2 - i)) ? c : '-')).join('')).join('')
  const date = stat.mtime.toISOString().slice(0, 16).replace('T', ' ')
  return `${type}${perms} 1 hako hako ${stat.size} ${date} ${name}`
}

function code(e: unknown) {
  const err = e as NodeJS.ErrnoException & { status?: number }
  if (err.code === 'ENOENT') return STATUS_CODE.NO_SUCH_FILE
  if (err.code === 'EACCES' || err.code === 'EPERM' || err.status === 400) return STATUS_CODE.PERMISSION_DENIED
  return STATUS_CODE.FAILURE
}

function serve(sftp: SFTPWrapper, serverId: string) {
  const handles = new Map<number, Handle>()
  let next = 1
  const open = (h: Handle) => {
    const id = next++
    handles.set(id, h)
    const buf = Buffer.alloc(4)
    buf.writeUInt32BE(id)
    return buf
  }
  const get = (buf: Buffer) => (buf.length === 4 ? handles.get(buf.readUInt32BE(0)) : undefined)
  const inside = (p: string, root = true) => resolveInside(serverId, path.posix.normalize(`/${p}`), root)
  const run = (reqId: number, fn: () => Promise<void>) => fn().catch((e) => sftp.status(reqId, code(e)))
  const ok = (reqId: number) => sftp.status(reqId, STATUS_CODE.OK)

  sftp.on('REALPATH', (reqId, p) => {
    const full = path.posix.resolve('/', p || '.')
    sftp.name(reqId, [{ filename: full, longname: full, attrs: {} as Attributes }])
  })
  sftp.on('STAT', (reqId, p) => run(reqId, async () => void sftp.attrs(reqId, attrs(await fsp.stat(await inside(p))))))
  sftp.on('LSTAT', (reqId, p) => run(reqId, async () => void sftp.attrs(reqId, attrs(await fsp.stat(await inside(p))))))
  sftp.on('OPEN', (reqId, p, flags) =>
    run(reqId, async () => {
      const mode = ssh2.utils.sftp.flagsToString(flags)
      if (!mode) return void sftp.status(reqId, STATUS_CODE.OP_UNSUPPORTED)
      const target = await inside(p)
      if (target === (await resolveInside(serverId, ''))) return void sftp.status(reqId, STATUS_CODE.PERMISSION_DENIED)
      sftp.handle(reqId, open({ kind: 'file', fd: (await fsp.open(target, mode)).fd }))
    }),
  )
  sftp.on('READ', (reqId, handle, offset, length) => {
    const h = get(handle)
    if (h?.kind !== 'file') return sftp.status(reqId, STATUS_CODE.FAILURE)
    const buf = Buffer.alloc(Math.min(length, 256 * 1024))
    fs.read(h.fd, buf, 0, buf.length, offset, (err, n) => {
      if (err) return sftp.status(reqId, code(err))
      if (!n) return sftp.status(reqId, STATUS_CODE.EOF)
      sftp.data(reqId, buf.subarray(0, n))
    })
  })
  sftp.on('WRITE', (reqId, handle, offset, data) => {
    const h = get(handle)
    if (h?.kind !== 'file') return sftp.status(reqId, STATUS_CODE.FAILURE)
    fs.write(h.fd, data, 0, data.length, offset, (err) => (err ? sftp.status(reqId, code(err)) : ok(reqId)))
  })
  sftp.on('FSTAT', (reqId, handle) => {
    const h = get(handle)
    if (h?.kind !== 'file') return sftp.status(reqId, STATUS_CODE.FAILURE)
    fs.fstat(h.fd, (err, stat) => (err ? sftp.status(reqId, code(err)) : sftp.attrs(reqId, attrs(stat))))
  })
  sftp.on('CLOSE', (reqId, handle) => {
    const h = get(handle)
    if (!h) return sftp.status(reqId, STATUS_CODE.FAILURE)
    handles.delete(handle.readUInt32BE(0))
    if (h.kind === 'file') fs.close(h.fd, () => ok(reqId))
    else ok(reqId)
  })
  sftp.on('OPENDIR', (reqId, p) =>
    run(reqId, async () => {
      const dir = await inside(p)
      if (!(await fsp.stat(dir)).isDirectory()) return void sftp.status(reqId, STATUS_CODE.FAILURE)
      sftp.handle(reqId, open({ kind: 'dir', dir, done: false }))
    }),
  )
  sftp.on('READDIR', (reqId, handle) => {
    const h = get(handle)
    if (h?.kind !== 'dir') return sftp.status(reqId, STATUS_CODE.FAILURE)
    if (h.done) return sftp.status(reqId, STATUS_CODE.EOF)
    h.done = true
    run(reqId, async () => {
      const names = await fsp.readdir(h.dir)
      const entries = (await Promise.all(names.map(async (name) => {
        const stat = await fsp.stat(path.join(h.dir, name)).catch(() => null)
        return stat ? { filename: name, longname: longname(name, stat), attrs: attrs(stat) } : null
      }))).filter((e) => e !== null)
      if (!entries.length) return void sftp.status(reqId, STATUS_CODE.EOF)
      sftp.name(reqId, entries)
    })
  })
  sftp.on('REMOVE', (reqId, p) => run(reqId, async () => {
    await fsp.unlink(await inside(p, false))
    ok(reqId)
  }))
  sftp.on('RMDIR', (reqId, p) => run(reqId, async () => {
    await fsp.rmdir(await inside(p, false))
    ok(reqId)
  }))
  sftp.on('MKDIR', (reqId, p) => run(reqId, async () => {
    await fsp.mkdir(await inside(p, false))
    ok(reqId)
  }))
  sftp.on('RENAME', (reqId, from, to) => run(reqId, async () => {
    await fsp.rename(await inside(from, false), await inside(to, false))
    ok(reqId)
  }))
  const setstat = async (target: string, a: Attributes) => {
    if (a.size !== undefined) await fsp.truncate(target, a.size)
    if (a.mtime !== undefined) await fsp.utimes(target, a.atime ?? a.mtime, a.mtime)
  }
  sftp.on('SETSTAT', (reqId, p, a) => run(reqId, async () => {
    await setstat(await inside(p), a)
    ok(reqId)
  }))
  sftp.on('FSETSTAT', (reqId, handle, a) => {
    const h = get(handle)
    if (h?.kind !== 'file') return sftp.status(reqId, STATUS_CODE.FAILURE)
    run(reqId, async () => {
      if (a.size !== undefined) await new Promise<void>((resolve, reject) => fs.ftruncate(h.fd, a.size, (e) => (e ? reject(e) : resolve())))
      if (a.mtime !== undefined) await new Promise<void>((resolve, reject) => fs.futimes(h.fd, a.atime ?? a.mtime!, a.mtime!, (e) => (e ? reject(e) : resolve())))
      ok(reqId)
    })
  })
  for (const op of ['READLINK', 'SYMLINK'] as const) sftp.on(op, (reqId: number) => sftp.status(reqId, STATUS_CODE.OP_UNSUPPORTED))
  sftp.on('close', () => {
    for (const h of handles.values()) if (h.kind === 'file') fs.close(h.fd, () => {})
    handles.clear()
  })
}

export function startSftp() {
  if (!env.sftpPort) return
  const server = new ssh2.Server({ hostKeys: [hostKey()] }, (client, info) => {
    let serverId: string | null = null
    client.on('authentication', (ctx) => {
      if (ctx.method !== 'password') return ctx.reject(['password'])
      authorize(ctx.username, ctx.password, info.ip).then((id) => {
        serverId = id
        if (id) ctx.accept()
        else ctx.reject(['password'])
      }, () => ctx.reject(['password']))
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('sftp', (acceptSftp) => serve(acceptSftp(), serverId!))
        session.on('exec', (_accept, reject) => reject())
        session.on('shell', (_accept, reject) => reject())
        session.on('pty', (_accept, reject) => reject?.())
      })
      client.on('tcpip', (_accept, reject) => reject())
    })
    client.on('error', () => {})
  })
  server.on('error', (e: Error) => console.error(`[hako] sftp: ${e.message}`))
  server.listen(env.sftpPort, env.host, () => console.log(`[hako] sftp listening on ${env.host}:${env.sftpPort}`))
  return server
}
