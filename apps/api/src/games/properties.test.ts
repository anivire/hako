import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseProperties, updateProperties } from '@hako/shared'

const sample = '#Minecraft server properties\n#Fri Nov 21 2026\nmotd=A Minecraft Server\: hi\nmax-players=20\nlevel-seed=\nonline-mode = true\nname=\u041f\u0440\u0438\u0432\u0435\u0442\n'

test('parses keys, separators and escapes', () => {
  const props = parseProperties(sample)
  assert.equal(props.motd, 'A Minecraft Server: hi')
  assert.equal(props['max-players'], '20')
  assert.equal(props['level-seed'], '')
  assert.equal(props['online-mode'], 'true')
  assert.equal(props.name, 'Привет')
})

test('updates in place, keeps comments and appends new keys', () => {
  const next = updateProperties(sample, { 'max-players': '50', motd: 'Привет: мир=1', pvp: 'false' })
  assert.ok(next.startsWith('#Minecraft server properties\n#Fri Nov 21 2026\n'))
  assert.match(next, /^max-players=50$/m)
  assert.match(next, /^pvp=false$/m)
  const back = parseProperties(next)
  assert.equal(back.motd, 'Привет: мир=1')
  assert.equal(back['online-mode'], 'true')
  assert.equal(back.pvp, 'false')
  assert.ok(next.endsWith('\n') && !next.endsWith('\n\n'))
})
