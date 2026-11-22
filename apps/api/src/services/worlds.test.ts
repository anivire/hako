import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { zipSync } from 'fflate'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hako-worlds-'))
process.env.DATA_DIR = root

test('worlds are listed, switched, uploaded and deleted', async () => {
  const { db, runMigrations } = await import('../db/client')
  const { servers, users } = await import('../db/schema')
  const { loadGames } = await import('../games/registry')
  const { serverDir } = await import('../runtime/instances')
  const { deleteWorld, listWorlds, selectWorld, uploadWorld } = await import('./worlds')
  runMigrations()
  loadGames()
  db.insert(users).values({ id: 1, username: 'a', passwordHash: 'x', createdAt: '' }).run()
  const valheim = db.insert(servers).values({ id: 'w1', name: 'v', game: 'valheim', memory: 4096, variables: { WORLD: 'world' }, ownerId: 1, createdAt: '' }).returning().get()
  const dir = path.join(serverDir('w1'), 'worlds_local')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'world.fwl'), 'a')
  fs.writeFileSync(path.join(dir, 'world.db'), 'bb')
  let list = await listWorlds(valheim)
  assert.deepEqual(list.worlds.map((w) => [w.name, w.size, w.current]), [['world', 3, true]])
  list = await uploadWorld(valheim, 'Other.zip', zipSync({ 'Other.fwl': new Uint8Array([1]), 'Other.db': new Uint8Array([2]) }))
  assert.deepEqual(list.worlds.map((w) => w.name), ['world', 'Other'])
  list = await uploadWorld(valheim, 'export.zip', zipSync({ 'worlds_local/Third.fwl': new Uint8Array([1]) }))
  assert.ok(list.worlds.some((w) => w.name === 'Third'))
  await assert.rejects(uploadWorld(valheim, 'evil.zip', zipSync({ '../../escape.txt': new Uint8Array([1]) })), /PATH_INVALID/)
  await assert.rejects(selectWorld(valheim, 'bad/name'), /WORLD_NAME_INVALID/)
  list = await selectWorld(valheim, 'Other')
  assert.equal(list.current, 'Other')
  await assert.rejects(deleteWorld(valheim, 'Other'), /WORLD_IS_CURRENT/)
  list = await deleteWorld(valheim, 'world')
  assert.ok(!fs.existsSync(path.join(dir, 'world.db')))

  const minecraft = db.insert(servers).values({ id: 'm1', name: 'm', game: 'minecraft', memory: 4096, variables: {}, ownerId: 1, createdAt: '' }).returning().get()
  list = await uploadWorld(minecraft, 'castle.zip', zipSync({ 'level.dat': new Uint8Array([1]), 'region/r.0.0.mca': new Uint8Array([2]) }))
  assert.deepEqual(list.worlds.map((w) => w.name), ['castle'])
  assert.equal(list.current, 'world')
  list = await selectWorld(minecraft, 'castle')
  assert.equal(list.current, 'castle')
  assert.match(fs.readFileSync(path.join(serverDir('m1'), 'server.properties'), 'utf8'), /^level-name=castle$/m)

  const factorio = db.insert(servers).values({ id: 'f1', name: 'f', game: 'factorio', memory: 2048, variables: {}, ownerId: 1, createdAt: '' }).returning().get()
  list = await uploadWorld(factorio, 'megabase.zip', zipSync({ 'megabase/level.dat0': new Uint8Array([1]) }))
  assert.deepEqual(list.worlds.map((w) => w.name), ['megabase'])
  assert.ok(fs.existsSync(path.join(serverDir('f1'), 'saves', 'megabase.zip')))
})
