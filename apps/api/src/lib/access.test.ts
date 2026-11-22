import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadGames } from '../games/registry'
import { allows, requiredPermission } from './access'

loadGames()
const valheim = { id: 'x', name: 'v', game: 'valheim', memory: 4096, cpu: null, icon: null, variables: {}, ports: {}, ownerId: 1, createdAt: '' }

test('each server action needs its own permission', () => {
  assert.equal(requiredPermission('GET', '', valheim, ''), null)
  assert.equal(requiredPermission('PATCH', '', valheim, ''), 'settings')
  assert.equal(requiredPermission('DELETE', '', valheim, ''), 'manage')
  assert.equal(requiredPermission('POST', '/power', valheim, ''), 'power')
  assert.equal(requiredPermission('POST', '/command', valheim, ''), 'console')
  assert.equal(requiredPermission('GET', '/ws', valheim, ''), null)
  assert.equal(requiredPermission('GET', '/files', valheim, ''), 'files')
  assert.equal(requiredPermission('PUT', '/files/content', valheim, 'adminlist.txt'), 'config')
  assert.equal(requiredPermission('PUT', '/files/content', valheim, 'bepinex/com.mod.cfg'), 'config')
  assert.equal(requiredPermission('PUT', '/files/content', valheim, 'bepinex/plugins/evil.dll'), 'files')
  assert.equal(requiredPermission('PUT', '/files/content', valheim, 'bepinex/../x.cfg'), 'files')
  assert.equal(requiredPermission('POST', '/addons', valheim, ''), 'addons')
  assert.equal(requiredPermission('GET', '/addons/icon', valheim, ''), null)
  assert.equal(requiredPermission('PUT', '/members/2', valheim, ''), 'manage')
})

test('managers can do everything, members only what they were given', () => {
  const owner = { owner: true, manage: true, permissions: [] }
  const member = { owner: false, manage: false, permissions: ['console' as const] }
  assert.equal(allows(owner, 'files'), true)
  assert.equal(allows(member, 'console'), true)
  assert.equal(allows(member, 'power'), false)
  assert.equal(allows(member, 'manage'), false)
  assert.equal(allows(member, null), true)
  assert.equal(allows({ owner: false, manage: false, permissions: ['files'] }, 'config'), true)
})
