import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gameTemplateSchema } from '@hako/shared'
import factorio from '../games/builtin/factorio.json'
import minecraft from '../games/builtin/minecraft.json'
import terraria from '../games/builtin/terraria.json'
import { PlayerTracker } from './players'

const tracker = (raw: unknown) => new PlayerTracker(gameTemplateSchema.parse(raw).console.players!)

test('Minecraft players are tracked from join and leave lines, split across chunks', () => {
  const t = tracker(minecraft)
  assert.equal(t.feed('[12:00:01] [Server thread/INFO]: Steve joined the game\n[12:00:02] [Server thread/INFO]: Al'), true)
  assert.equal(t.feed('ex joined the game\n\u001b[33m[12:00:03] [Server thread/INFO] [minecraft/MinecraftServer]: Notch[/1.2.3.4:5] joined the game\u001b[0m\n'), true)
  assert.deepEqual(t.list, ['Alex', 'Notch', 'Steve'])
  t.feed('[12:05:00] [Server thread/INFO]: Steve left the game\n[12:05:01] [Server thread/INFO]: <Alex> who joined the game\n')
  assert.deepEqual(t.list, ['Alex', 'Notch'])
  t.reset()
  assert.deepEqual(t.list, [])
})

test('Terraria and Factorio lines are understood', () => {
  const terra = tracker(terraria)
  terra.feed(': Andrew has joined.\nGuide (127.0.0.1:5555) has joined.\n: Andrew has left.\n')
  assert.deepEqual(terra.list, ['Guide'])
  const fact = tracker(factorio)
  fact.feed('2026-11-22 10:00:00 [JOIN] engineer joined the game\n2026-11-22 10:00:05 [JOIN] biter_fan joined the game\n2026-11-22 10:01:00 [LEAVE] engineer left the game\n')
  assert.deepEqual(fact.list, ['biter_fan'])
})
