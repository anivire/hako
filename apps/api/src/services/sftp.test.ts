import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import ssh2 from 'ssh2'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hako-sftp-'))
const port = 20000 + Math.floor(Math.random() * 20000)
process.env.DATA_DIR = root
process.env.SFTP_PORT = String(port)
process.env.HOST = '127.0.0.1'

function connect(username: string, password: string): Promise<{ client: ssh2.Client; sftp: ssh2.SFTPWrapper }> {
  return new Promise((resolve, reject) => {
    const client = new ssh2.Client()
    client.on('ready', () => client.sftp((err, sftp) => (err ? reject(err) : resolve({ client, sftp }))))
    client.on('error', reject)
    client.connect({ host: '127.0.0.1', port, username, password, readyTimeout: 10_000 })
  })
}

const call = <T>(fn: (cb: (err: Error | null | undefined, value?: T) => void) => void) => new Promise<T>((resolve, reject) => fn((err, value) => (err ? reject(err) : resolve(value as T))))

test('sftp logs in with the panel password and stays inside the server folder', async () => {
  const { db, runMigrations } = await import('../db/client')
  const { servers, users } = await import('../db/schema')
  const { hashPassword } = await import('../lib/crypto')
  const { serverDir } = await import('../runtime/instances')
  const { sftpLogin, startSftp } = await import('./sftp')
  runMigrations()
  db.insert(users).values([
    { id: 1, username: 'owner', passwordHash: await hashPassword('secret-pass'), createdAt: '' },
    { id: 2, username: 'stranger', passwordHash: await hashPassword('secret-pass'), createdAt: '' },
  ]).run()
  db.insert(servers).values({ id: 's1', name: 's', game: 'valheim', memory: 1024, ownerId: 1, createdAt: '' }).run()
  fs.mkdirSync(serverDir('s1'), { recursive: true })
  fs.writeFileSync(path.join(root, 'secret.txt'), 'outside')
  assert.deepEqual(sftpLogin('a.b.s1'), { username: 'a.b', serverId: 's1' })
  assert.equal(sftpLogin('nodot'), null)
  const server = startSftp()
  await new Promise((r) => setTimeout(r, 300))

  await assert.rejects(connect('owner.s1', 'wrong'))
  await assert.rejects(connect('stranger.s1', 'secret-pass'))
  const { client, sftp } = await connect('owner.s1', 'secret-pass')
  await call<void>((cb) => sftp.mkdir('/world', cb))
  await call<void>((cb) => sftp.writeFile('/world/hello.txt', 'hi there', cb))
  assert.equal(fs.readFileSync(path.join(serverDir('s1'), 'world', 'hello.txt'), 'utf8'), 'hi there')
  const list = await call<ssh2.FileEntryWithStats[]>((cb) => sftp.readdir('/world', cb))
  assert.deepEqual(list.map((e) => e.filename), ['hello.txt'])
  assert.equal(String(await call<Buffer>((cb) => sftp.readFile('/world/hello.txt', cb))), 'hi there')
  await call<void>((cb) => sftp.rename('/world/hello.txt', '/world/bye.txt', cb))
  assert.equal(String(await call<Buffer>((cb) => sftp.readFile('/../../secret.txt', cb)).catch(() => 'denied')), 'denied')
  await assert.rejects(call<void>((cb) => sftp.rmdir('/', cb)))
  assert.ok(fs.existsSync(serverDir('s1')))
  client.end()
  server?.close()
})
