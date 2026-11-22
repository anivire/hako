import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderServers } from './order'

test('servers follow the saved order, new ones go last, hidden ones are dropped', () => {
  const servers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  assert.deepEqual(orderServers(servers, ['c', 'a']).map((s) => s.id), ['c', 'a', 'b', 'd'])
  assert.deepEqual(orderServers(servers, ['c', 'gone', 'a'], ['b']).map((s) => s.id), ['c', 'a', 'd'])
  assert.deepEqual(orderServers(servers, []).map((s) => s.id), ['a', 'b', 'c', 'd'])
})
