import assert from 'node:assert/strict'
import { test } from 'node:test'
import { offlineUuid } from './players'

test('offline UUIDs match what an offline-mode server computes', () => {
  assert.equal(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f')
})
