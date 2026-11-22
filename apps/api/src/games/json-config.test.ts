import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseJsonConfig, parseJsonList, updateJsonConfig, writeJsonList } from '@hako/shared'

const SETTINGS = JSON.stringify({ name: 'Game', _comment_max_players: 'note', max_players: 0, visibility: { public: true, lan: true }, tags: ['a'], seed: null })

test('JSON configs flatten to dotted keys without comments and arrays', () => {
  assert.deepEqual(parseJsonConfig(SETTINGS), { name: 'Game', max_players: '0', 'visibility.public': 'true', 'visibility.lan': 'true', seed: '' })
  assert.deepEqual(parseJsonConfig('not json'), {})
})

test('JSON updates keep the value types', () => {
  const out = JSON.parse(updateJsonConfig(SETTINGS, { max_players: '12', 'visibility.public': 'false', seed: '123', name: '42', 'new.key': 'x' }))
  assert.equal(out.max_players, 12)
  assert.equal(out.visibility.public, false)
  assert.equal(out.seed, 123)
  assert.equal(out.name, '42')
  assert.equal(out.new.key, 'x')
  assert.equal(out._comment_max_players, 'note')
  assert.equal(JSON.parse(updateJsonConfig(SETTINGS, { seed: '' })).seed, null)
  assert.equal(JSON.parse(updateJsonConfig(SETTINGS, { max_players: 'abc' })).max_players, 0)
})

test('JSON lists keep extra fields of remaining entries', () => {
  const bans = JSON.stringify(['alice', { username: 'bob', reason: 'griefing' }])
  assert.deepEqual(parseJsonList(bans), ['alice', 'bob'])
  assert.deepEqual(JSON.parse(writeJsonList(bans, ['bob', 'carol'])), [{ username: 'bob', reason: 'griefing' }, 'carol'])
})
