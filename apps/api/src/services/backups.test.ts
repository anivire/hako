import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hako-backups-'))
process.env.DATA_DIR = root

test('backup skips volume folders, restore brings files back and keeps them', async () => {
  const { loadGames } = await import('../games/registry')
  const { createBackup, listBackups, restoreBackup } = await import('./backups')
  const { serverDir } = await import('../runtime/instances')
  loadGames()
  const server = { id: 'b1', name: 'v', game: 'valheim', memory: 4096, cpu: null, backupLimit: 2, icon: null, variables: {}, ports: {}, ownerId: 1, createdAt: '' }
  const dir = serverDir(server.id)
  fs.mkdirSync(path.join(dir, 'worlds_local'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.server'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'worlds_local', 'world.db'), 'one')
  fs.writeFileSync(path.join(dir, '.server', 'big.bin'), 'install')
  const first = await createBackup(server)
  fs.writeFileSync(path.join(dir, 'worlds_local', 'world.db'), 'two')
  fs.writeFileSync(path.join(dir, 'extra.txt'), 'x')
  await createBackup(server)
  await createBackup(server)
  assert.equal((await listBackups(server.id)).length, 2)
  assert.ok(!(await listBackups(server.id)).some((b) => b.name === first.name))
  const latest = (await listBackups(server.id))[0]!
  fs.writeFileSync(path.join(dir, 'worlds_local', 'world.db'), 'three')
  await restoreBackup(server, latest.name)
  assert.equal(fs.readFileSync(path.join(dir, 'worlds_local', 'world.db'), 'utf8'), 'two')
  assert.equal(fs.readFileSync(path.join(dir, '.server', 'big.bin'), 'utf8'), 'install')
  await assert.rejects(restoreBackup(server, '../../etc.tar.gz'), /PATH_INVALID/)
})
