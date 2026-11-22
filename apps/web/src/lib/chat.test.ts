import assert from 'node:assert/strict'
import { test } from 'node:test'
import minecraft from '../../../api/src/games/builtin/minecraft.json'
import factorio from '../../../api/src/games/builtin/factorio.json'
import { chatParser } from './chat'

test('reads Minecraft chat, commands, server messages and joins', () => {
  const parse = chatParser(minecraft.console.chat, minecraft.console.players)
  assert.deepEqual(parse('[23:28:42] [Server thread/INFO]: <BongoCkat> hello there\r'), { id: 1, time: '23:28:42', kind: 'message', name: 'BongoCkat', text: 'hello there' })
  assert.equal(parse('[23:28:43 INFO]: [Not Secure] <neon0506> hi')?.name, 'neon0506')
  assert.deepEqual(parse('[23:28:44 INFO]: BongoCkat issued server command: /home jude'), { id: 3, time: '23:28:44', kind: 'command', name: 'BongoCkat', text: '/home jude' })
  assert.equal(parse('[23:28:45] [Server thread/INFO]: [Server] restart soon')?.kind, 'server')
  assert.equal(parse('[23:16:47] [Server thread/INFO]: BongoCkat joined the game')?.kind, 'join')
  assert.equal(parse('2026-11-22 12:00:00 [INFO] <anivire_> beta chat')?.text, 'beta chat')
  assert.equal(parse('[23:28:46] [Server thread/INFO]: Done (3.5s)!'), null)
})

test('reads Factorio chat and server lines', () => {
  const parse = chatParser(factorio.console.chat, factorio.console.players)
  assert.equal(parse('2026-11-22 12:00:00 [CHAT] bob: Error is fine')?.text, 'Error is fine')
  assert.equal(parse('2026-11-22 12:00:01 [CHAT] <server>: hello')?.kind, 'server')
  assert.equal(parse('2026-11-22 12:00:02 [JOIN] bob joined the game')?.kind, 'join')
})
