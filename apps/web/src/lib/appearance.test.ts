import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageMax } from './appearance'

test('page width steps down one size per breakpoint the viewport is below', () => {
  assert.equal(pageMax('9xl', 1920, 16), '120rem')
  assert.equal(pageMax('9xl', 1600, 16), '96rem')
  assert.equal(pageMax('9xl', 1366, 16), '80rem')
  assert.equal(pageMax('7xl', 1200, 16), '64rem')
  assert.equal(pageMax('5xl', 1200, 16), '64rem')
  assert.equal(pageMax('full', 800, 16), '100vw')
})
