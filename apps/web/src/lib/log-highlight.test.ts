import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterLog, highlight } from './log-highlight'

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

test('colours vanilla and paper log levels without changing the text', () => {
  const vanilla = '[14:22:33] [Server thread/INFO]: Done (3.500s)!\r'
  const paper = '\r\x1b[K[14:11:49 WARN]: Something odd\r'
  assert.equal(strip(highlight(vanilla)), vanilla)
  assert.equal(strip(highlight(paper)), paper)
  assert.match(highlight(vanilla), /\x1b\[36mINFO/)
  assert.match(highlight(paper), /\x1b\[33mWARN\x1b\[0m.*\x1b\[33m Something odd/)
})

test('leaves lines with their own colours and unknown lines alone', () => {
  const coloured = '[14:22:33 INFO]: \x1b[32mgreen\x1b[0m'
  assert.equal(highlight(coloured), coloured)
  assert.equal(highlight('>....'), '>....')
  assert.equal(highlight('a\nb'), 'a\nb')
})

test('filters lines by level and keeps stack traces with their error', () => {
  const state = { pending: '', level: null }
  const log = [
    '[14:00:00] [Server thread/INFO]: Starting\r',
    '>....\r\x1b[K[14:00:01 WARN]: Can\'t keep up!\r',
    '[14:00:02] [Server thread/ERROR]: Boom\r',
    '\tat net.minecraft.Foo.bar(Foo.java:1)\r',
    '[14:00:03] [Server thread/INFO]: Done\r',
    '[14:00:04] [Server thread/ERR',
  ].join('\n')
  const errors = filterLog(log, 'error', state)
  assert.equal(strip(errors), '[14:00:02] [Server thread/ERROR]: Boom\r\n\tat net.minecraft.Foo.bar(Foo.java:1)\r\n')
  assert.equal(state.pending, '[14:00:04] [Server thread/ERR')
  assert.equal(filterLog('OR]: Again\r\n', 'error', state), '[14:00:04] [Server thread/ERROR]: Again\r\n')
  assert.match(filterLog(log, 'warn', { pending: '', level: null }), /Can't keep up/)
  assert.equal(filterLog(log, 'info', { pending: '', level: null }).split('\r\n').length - 1, 2)
})
