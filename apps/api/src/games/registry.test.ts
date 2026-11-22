import assert from 'node:assert/strict'
import { test } from 'node:test'
import { builtinVariables, gameTemplateSchema, resolveTemplate, serverHeap, serverIconSchema, startupLine } from '@hako/shared'
import factorio from './builtin/factorio.json'
import minecraft from './builtin/minecraft.json'
import terraria from './builtin/terraria.json'
import valheim from './builtin/valheim.json'
import { containerEnv, interpolate, resolveVariables } from './registry'

test('builtin templates are valid', () => {
  for (const raw of [minecraft, factorio, terraria, valheim]) assert.equal(gameTemplateSchema.safeParse(raw).success, true)
})

test('interpolate fills known keys and blanks unknown ones', () => {
  assert.equal(interpolate('itzg/minecraft-server:{{JAVA}}', { JAVA: 'java21' }), 'itzg/minecraft-server:java21')
  assert.equal(interpolate('{{ A }}-{{MISSING}}', { A: 'x' }), 'x-')
})

test('resolveVariables applies defaults and validates', () => {
  const game = gameTemplateSchema.parse(minecraft)
  const vars = resolveVariables(game, { EULA: 'true', TYPE: 'FABRIC' })
  assert.equal(vars.TYPE, 'FABRIC')
  assert.equal(vars.JAVA, 'latest')
  assert.throws(() => resolveVariables(game, {}), /VARIABLE_INVALID:EULA/)
  assert.throws(() => resolveVariables(game, { EULA: 'true', TYPE: 'BUKKIT' }), /VARIABLE_INVALID:TYPE/)
  assert.throws(() => resolveVariables(game, { EULA: 'true', JAVA: 'latest; rm -rf /' }), /VARIABLE_INVALID:JAVA/)
})

test('locked variables keep their existing value', () => {
  const game = gameTemplateSchema.parse(factorio)
  const vars = resolveVariables(game, { SAVE_NAME: 'other' }, { SAVE_NAME: 'world', VERSION: 'stable' })
  assert.equal(vars.SAVE_NAME, 'world')
  assert.throws(() => resolveVariables(game, { SAVE_NAME: '../x' }), /VARIABLE_INVALID:SAVE_NAME/)
})

test('hidden variables are cleared and skip validation', () => {
  const game = gameTemplateSchema.parse(minecraft)
  const pack = resolveVariables(game, { EULA: 'true', KIND: 'modpack', MODRINTH_MODPACK: 'cobblemon-fabric', VERSION: '1.21.4' })
  assert.equal(pack.VERSION, '')
  assert.equal(pack.MODRINTH_MODPACK, 'cobblemon-fabric')
  assert.throws(() => resolveVariables(game, { EULA: 'true', KIND: 'modpack' }), /VARIABLE_INVALID:MODRINTH_MODPACK/)
  assert.throws(() => resolveVariables(game, { EULA: 'true', KIND: 'modpack', MODRINTH_MODPACK: 'a b/../c' }), /VARIABLE_INVALID:MODRINTH_MODPACK/)
  assert.equal(resolveVariables(game, { EULA: 'true', MODRINTH_MODPACK: 'x' }).MODRINTH_MODPACK, '')
})

test('a variable that becomes visible again falls back to its default', () => {
  const game = gameTemplateSchema.parse(minecraft)
  const pack = resolveVariables(game, { EULA: 'true', KIND: 'modpack', MODRINTH_MODPACK: 'x' })
  assert.equal(resolveVariables(game, { KIND: 'core' }, pack).VERSION, 'LATEST')
})

test('server type and modpack platform fill the TYPE env together', () => {
  const game = gameTemplateSchema.parse(minecraft)
  const core = resolveVariables(game, { EULA: 'true', TYPE: 'FABRIC' })
  assert.equal(interpolate(game.env.TYPE!, core), 'FABRIC')
  const pack = resolveVariables(game, { EULA: 'true', KIND: 'modpack', PLATFORM: 'AUTO_CURSEFORGE', CF_SLUG: 'all-the-mods-10' })
  assert.equal(interpolate(game.env.TYPE!, pack), 'AUTO_CURSEFORGE')
  assert.equal(pack.TYPE, '')
  assert.throws(() => resolveVariables(game, { EULA: 'true', TYPE: 'MODRINTH' }), /VARIABLE_INVALID:TYPE/)
})

test('empty variables are not passed to the container, literal empty values are', () => {
  const game = gameTemplateSchema.parse(minecraft)
  const vars = resolveVariables(game, { EULA: 'true', KIND: 'modpack', MODRINTH_MODPACK: 'better-mc-fabric-bmc2' })
  const env = containerEnv(game, { ...vars, ...builtinVariables(4096) })
  assert.ok(env.includes('TYPE=MODRINTH'))
  assert.ok(env.includes('MODRINTH_MODPACK=better-mc-fabric-bmc2'))
  assert.ok(env.includes('MEMORY=3456M'))
  assert.ok(!env.some((e) => e.startsWith('VERSION=') || e.startsWith('MODRINTH_VERSION=') || e.startsWith('CF_SLUG=')))
})

test('server icons must be https URLs or image data URLs', () => {
  assert.equal(serverIconSchema.safeParse('https://cdn.modrinth.com/data/abc/icon.png').success, true)
  assert.equal(serverIconSchema.safeParse('data:image/png;base64,iVBORw0KGgo=').success, true)
  assert.equal(serverIconSchema.safeParse(null).success, true)
  assert.equal(serverIconSchema.safeParse('javascript:alert(1)').success, false)
  assert.equal(serverIconSchema.safeParse('data:image/svg+xml;base64,PHN2Zz4=').success, false)
  assert.equal(serverIconSchema.safeParse('https://x.y/a" onerror="x').success, false)
})

test('selected options add their own environment variables', () => {
  const game = gameTemplateSchema.parse(minecraft)
  const aikar = containerEnv(game, resolveVariables(game, { EULA: 'true' }))
  assert.ok(aikar.includes('USE_AIKAR_FLAGS=true'))
  assert.ok(!aikar.some((e) => e.startsWith('JVM_OPTS=') || e.startsWith('USE_MEOWICE_FLAGS=')))
  const custom = containerEnv(game, resolveVariables(game, { EULA: 'true', JVM_FLAGS: 'meowice', JVM_OPTS: '-Dfile.encoding=UTF-8' }))
  assert.ok(custom.includes('USE_MEOWICE_FLAGS=true'))
  assert.ok(custom.includes('JVM_OPTS=-Dfile.encoding=UTF-8'))
  assert.ok(!custom.some((e) => e.startsWith('USE_AIKAR_FLAGS=')))
  assert.ok(!containerEnv(game, resolveVariables(game, { EULA: 'true', JVM_FLAGS: 'none' })).some((e) => e.startsWith('USE_AIKAR') || e.startsWith('USE_MEOWICE')))
})

test('heap leaves room for the JVM and the startup line follows the settings', () => {
  assert.equal(serverHeap(4096), 3456)
  assert.equal(serverHeap(2048), 1536)
  assert.equal(serverHeap(16384), 13888)
  const game = gameTemplateSchema.parse(minecraft)
  const aikar = startupLine(game, { JVM_FLAGS: 'aikar', EXTRA_ARGS: '--forceUpgrade' }, 4096)!
  assert.match(aikar, /^java -XX:\+UseG1GC .* -Daikars\.new\.flags=true -Xmx3456M -Xms3456M -jar server\.jar --forceUpgrade$/)
  assert.ok(!aikar.includes('  '))
  const plain = startupLine(game, { JVM_FLAGS: 'none', SIMD: 'true', JVM_OPTS: '-Dfile.encoding=UTF-8' }, 2048)
  assert.equal(plain, 'java --add-modules=jdk.incubator.vector -Xmx1536M -Xms1536M -Dfile.encoding=UTF-8 -jar server.jar')
})

test('own .mrpack switches the image to the uploaded file', () => {
  const game = gameTemplateSchema.parse(minecraft)
  assert.throws(() => resolveVariables(game, { EULA: 'true', KIND: 'modpack', PLATFORM: 'MRPACK' }), /VARIABLE_INVALID:MRPACK_FILE/)
  const vars = resolveVariables(game, { EULA: 'true', KIND: 'modpack', PLATFORM: 'MRPACK', MRPACK_FILE: 'My Pack 1.0.mrpack' })
  const env = containerEnv(game, { ...vars, ...builtinVariables(4096) })
  assert.ok(env.includes('TYPE=MODRINTH'))
  assert.ok(env.includes('MODRINTH_MODPACK=/data/modpack.mrpack'))
})

test('Terraria switches image, console and mods with the server type', () => {
  const game = gameTemplateSchema.parse(terraria)
  const vanillaVars = resolveVariables(game, {})
  const vanilla = resolveTemplate(game, vanillaVars)
  assert.equal(interpolate(vanilla.image, vanillaVars), 'ryshe/terraria:vanilla-1.4.5.8')
  assert.equal(vanilla.console.exec, undefined)
  assert.equal(vanilla.configs.length, 1)
  assert.equal(vanilla.addons.length, 0)
  assert.ok(containerEnv(game, vanillaVars).includes('CONFIGPATH=/data'))
  assert.ok(!containerEnv(game, vanillaVars).some((e) => e.startsWith('TMOD_')))

  const tmlVars = resolveVariables(game, { TYPE: 'tmodloader' })
  const tml = resolveTemplate(game, tmlVars)
  assert.equal(interpolate(tml.image, tmlVars), 'jacobsmile/tmodloader1.4:v2026.09.2.1')
  assert.deepEqual(tml.console.exec, ['inject'])
  assert.deepEqual(tml.command, [])
  assert.equal(tml.configs.length, 0)
  assert.equal(tml.addons[0]!.source, 'workshop')
  const env = containerEnv(game, tmlVars)
  assert.ok(env.includes('TMOD_PASS=N/A'))
  assert.ok(!env.some((e) => e.startsWith('CONFIGPATH=') || e.startsWith('TMOD_AUTODOWNLOAD=')))
  assert.ok(containerEnv(game, resolveVariables(game, { TYPE: 'tmodloader', ACCESS: 'password', PASSWORD: 'hunter2' })).includes('TMOD_PASS=hunter2'))

  const tshockVars = resolveVariables(game, { TYPE: 'tshock' })
  const tshock = resolveTemplate(game, tshockVars)
  assert.equal(interpolate(tshock.image, tshockVars), 'ryshe/terraria:tshock-1.4.5.8-6.2.1')
  assert.deepEqual(tshock.volumes, [{ path: '/plugins', folder: 'plugins' }])
  assert.equal(tshock.configs[0]!.path, 'tshock/config.json')
  assert.deepEqual(tshock.command, vanilla.command)
  assert.ok(containerEnv(game, tshockVars).includes('CONFIGPATH=/data/tshock'))
})

test('managed variables keep their stored value on update', () => {
  const game = gameTemplateSchema.parse(terraria)
  const existing = resolveVariables(game, { TYPE: 'tmodloader', MODS: '2824688072,2669644269', MODS_ENABLED: '2824688072' })
  const updated = resolveVariables(game, { MODS: '', MOTD: 'hi' }, existing)
  assert.equal(updated.MODS, '2824688072,2669644269')
  assert.ok(containerEnv(game, updated).includes('TMOD_ENABLEDMODS=2824688072'))
  assert.throws(() => resolveVariables(game, { TYPE: 'tmodloader', MODS: '1;rm' }), /VARIABLE_INVALID:MODS/)
})

test('Valheim passes only the chosen world modifiers', () => {
  const game = gameTemplateSchema.parse(valheim)
  const args = (input: Record<string, string>) => containerEnv(game, resolveVariables(game, { PASSWORD: 'secret1', ...input })).find((e) => e.startsWith('SERVER_ARGS='))
  assert.equal(args({}), 'SERVER_ARGS=-preset normal -saveinterval 1800 -backups 4 -backupshort 7200 -backuplong 43200')
  assert.equal(args({ PRESET: 'hard', COMBAT: 'veryeasy', RAIDS: 'none', NOMAP: 'true', FIRE: 'false' }), 'SERVER_ARGS=-preset hard -modifier combat veryeasy -modifier raids none -setkey nomap -saveinterval 1800 -backups 4 -backupshort 7200 -backuplong 43200')
  assert.throws(() => resolveVariables(game, { PASSWORD: 'secret1', COMBAT: 'godmode' }), /VARIABLE_INVALID:COMBAT/)
  assert.throws(() => resolveVariables(game, { PASSWORD: 'secret1', BACKUPS: '' }), /VARIABLE_INVALID:BACKUPS/)
})

test('Valheim needs a password of at least 5 characters', () => {
  const game = gameTemplateSchema.parse(valheim)
  assert.throws(() => resolveVariables(game, { PASSWORD: 'abc' }), /VARIABLE_INVALID:PASSWORD/)
  assert.equal(resolveVariables(game, { PASSWORD: 'secret1' }).PRESET, 'normal')
  assert.equal(gameTemplateSchema.safeParse({ ...valheim, volumes: [{ path: '/x', folder: '..' }] }).success, false)
})

test('versions are read from the startup log', () => {
  const read = (raw: unknown, line: string) => new RegExp(gameTemplateSchema.parse(raw).console.version!).exec(line)?.[1]
  assert.equal(read(valheim, '11/22/2026 00:10:01: Valheim version: l-0.220.5 (network version 35)'), '0.220.5')
  assert.equal(read(factorio, '   0.000 2026-11-22 00:10:01; Factorio 2.1.24 (build 84123, linux64, headless, space-age)'), '2.1.24')
  assert.equal(read(minecraft, '[init] Starting minecraft server version 1.21.4'), '1.21.4')
})
