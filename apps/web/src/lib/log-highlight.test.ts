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

test('finds levels in factorio, tModLoader, TShock and syslog style lines', () => {
  const log = [
    '   0.001 Operating system: Linux\r',
    '   2.543 Warning ServerRouter.cpp:543: Conflicting address\r',
    '   2.560 Error ServerMultiplayerManager.cpp:744: Missing token.\r',
    '   2.561 Info ServerMultiplayerManager.cpp:900: Ready\r',
    '2026-11-22 12:00:00 [CHAT] bob: Error is fine\r',
    '[12:00:00.123] [Main Thread/WARN] [tML]: Slow mod\r',
    '[Server API] Error Plugin failed\r',
    'Nov 22 12:00:00 supervisord: valheim-server WARNING - low disk\r',
    '',
  ].join('\n')
  const lines = (f: 'error' | 'warn' | 'info') => strip(filterLog(log, f, { pending: '', level: null })).split('\r\n').filter(Boolean)
  assert.deepEqual(lines('error'), ['   2.560 Error ServerMultiplayerManager.cpp:744: Missing token.', '[Server API] Error Plugin failed'])
  assert.deepEqual(lines('warn'), ['   2.543 Warning ServerRouter.cpp:543: Conflicting address', '[12:00:00.123] [Main Thread/WARN] [tML]: Slow mod', 'Nov 22 12:00:00 supervisord: valheim-server WARNING - low disk'])
  assert.deepEqual(lines('info'), ['   2.561 Info ServerMultiplayerManager.cpp:900: Ready', '2026-11-22 12:00:00 [CHAT] bob: Error is fine'])
})
