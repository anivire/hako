import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeEntry } from './thunderstore'
import { parseIds } from './workshop'

const dirs = { plugins: 'bepinex/plugins', disabled: 'bepinex/disabled', patchers: 'bepinex/patchers', config: 'bepinex/config' }

test('Thunderstore zip entries land where r2modman puts them', () => {
  assert.equal(placeEntry('plugins/Jotunn.dll', 'ValheimModding-Jotunn', dirs), 'bepinex/plugins/ValheimModding-Jotunn/Jotunn.dll')
  assert.equal(placeEntry('BepInEx/plugins/sub/a.dll', 'a-b', dirs), 'bepinex/plugins/a-b/sub/a.dll')
  assert.equal(placeEntry('patchers/p.dll', 'a-b', dirs), 'bepinex/patchers/a-b/p.dll')
  assert.equal(placeEntry('config/a.cfg', 'a-b', dirs), 'bepinex/config/a.cfg')
  assert.equal(placeEntry('manifest.json', 'a-b', dirs), 'bepinex/plugins/a-b/manifest.json')
  assert.equal(placeEntry('Root.dll', 'a-b', dirs), 'bepinex/plugins/a-b/Root.dll')
  assert.equal(placeEntry('README.md', 'a-b', dirs), null)
  assert.equal(placeEntry('plugins/', 'a-b', dirs), null)
  assert.equal(placeEntry('../../evil.dll', 'a-b', dirs), null)
  assert.equal(placeEntry('plugins/../../../evil.dll', 'a-b', dirs), null)
})

test('Workshop ids are read from the browse page once each', () => {
  const html = '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=123"><img></a><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=123">T</a><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=456&searchtext=x">U</a>'
  assert.deepEqual(parseIds(html), ['123', '456'])
})
