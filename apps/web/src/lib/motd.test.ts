import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMotd, visibleLength } from './motd'

test('parses colours, styles, resets and two lines', () => {
  const [first, second] = parseMotd('§6§lGold §rplain\n§bnext §kxx')
  assert.deepEqual(
    first!.map((s) => [s.text, s.color, s.bold]),
    [
      ['Gold ', '#FFAA00', true],
      ['plain', '#AAAAAA', false],
    ],
  )
  assert.equal(second![0]!.color, '#55FFFF')
  assert.equal(second![1]!.obfuscated, true)
})

test('colour codes reset styles and extra lines are dropped', () => {
  const [line] = parseMotd('§lbold§cred')
  assert.equal(line![1]!.bold, false)
  assert.equal(parseMotd('a\nb\nc').length, 2)
  assert.equal(visibleLength('§6§lHi§r!'), 3)
})
