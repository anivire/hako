import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bepinexId, parseBepinex, parseIdList, updateBepinex, writeIdList } from '@hako/shared'

const CFG = `﻿## Settings file was created by plugin Jotunn v2.30.2
## Plugin GUID: com.jotunn.jotunn

[General]

## Show the mod settings menu
## in the game
# Setting type: Boolean
# Default value: true
Mod Settings = true

[Limits]

# Setting type: Int32
# Default value: 5
# Acceptable value range: From 0 to 10
Max = 7

# Setting type: LogLevel
# Default value: Info
# Acceptable values: None, Info, Debug
# Multiple values can be set at the same time by separating them with , (e.g. Debug, Warning)
Levels = Info, Debug

# Setting type: String
# Default value: a=b
Url = x=y
`

test('BepInEx configs are read with their metadata', () => {
  const file = parseBepinex(CFG)
  assert.equal(file.plugin, 'Jotunn')
  assert.equal(file.version, '2.30.2')
  assert.deepEqual(file.sections.map((s) => s.name), ['General', 'Limits'])
  const [general, limits] = file.sections
  assert.deepEqual({ ...general!.entries[0], id: undefined }, { id: undefined, section: 'General', key: 'Mod Settings', value: 'true', description: 'Show the mod settings menu\nin the game', type: 'Boolean', default: 'true', options: null, flags: false, min: null, max: null })
  assert.equal(limits!.entries[0]!.min, 0)
  assert.equal(limits!.entries[0]!.max, 10)
  assert.deepEqual(limits!.entries[1]!.options, ['None', 'Info', 'Debug'])
  assert.equal(limits!.entries[1]!.flags, true)
  assert.equal(limits!.entries[2]!.value, 'x=y')
})

test('BepInEx updates touch only the changed lines', () => {
  const out = updateBepinex(CFG, { [bepinexId('Limits', 'Max')]: '3', [bepinexId('General', 'Missing')]: '1' })
  assert.equal(out, CFG.replace('Max = 7', 'Max = 3'))
})

test('id lists keep their comments', () => {
  const text = '// List admin players ID  ONE per line\n76561198000000001\n'
  assert.deepEqual(parseIdList(text), ['76561198000000001'])
  assert.equal(writeIdList(text, ['1', '2']), '// List admin players ID  ONE per line\n1\n2\n')
})
