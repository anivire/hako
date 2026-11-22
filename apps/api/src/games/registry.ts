import { randomInt } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { type GameTemplate, SOURCE_VALUE_PATTERN, gameTemplateSchema, resolveTemplate, variableVisible } from '@hako/shared'
import { env } from '../env'
import { badRequest } from '../lib/http'
import factorio from './builtin/factorio.json'
import minecraft from './builtin/minecraft.json'
import bedrock from './builtin/minecraft-bedrock.json'
import terraria from './builtin/terraria.json'
import valheim from './builtin/valheim.json'
import projectZomboid from './builtin/project-zomboid.json'
import dontStarve from './builtin/dont-starve-together.json'
import coreKeeper from './builtin/core-keeper.json'
import satisfactory from './builtin/satisfactory.json'

const templates = new Map<string, GameTemplate>()

function register(raw: unknown, origin: string) {
  const parsed = gameTemplateSchema.safeParse(raw)
  if (!parsed.success) {
    console.error(`[hako] skipped game template ${origin}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    return
  }
  templates.set(parsed.data.id, parsed.data)
}

export function loadGames() {
  templates.clear()
  register(minecraft, 'builtin/minecraft.json')
  register(bedrock, 'builtin/minecraft-bedrock.json')
  register(factorio, 'builtin/factorio.json')
  register(terraria, 'builtin/terraria.json')
  register(valheim, 'builtin/valheim.json')
  register(projectZomboid, 'builtin/project-zomboid.json')
  register(dontStarve, 'builtin/dont-starve-together.json')
  register(coreKeeper, 'builtin/core-keeper.json')
  register(satisfactory, 'builtin/satisfactory.json')
  if (!fs.existsSync(env.gamesDir)) return
  for (const file of fs.readdirSync(env.gamesDir).filter((f) => f.endsWith('.json')).sort()) {
    const full = path.join(env.gamesDir, file)
    try {
      register(JSON.parse(fs.readFileSync(full, 'utf8')), full)
    } catch (e) {
      console.error(`[hako] skipped game template ${full}: ${e instanceof Error ? e.message : e}`)
    }
  }
}

export function listGames(): GameTemplate[] {
  return [...templates.values()]
}

export function getGame(id: string): GameTemplate | undefined {
  return templates.get(id)
}

export function serverGame(server: { game: string; variables: Record<string, string> }): GameTemplate | undefined {
  const game = getGame(server.game)
  return game && resolveTemplate(game, server.variables)
}

export function requireGame(id: string): GameTemplate {
  const game = templates.get(id)
  if (!game) badRequest('GAME_UNKNOWN')
  return game
}

export function interpolate(value: string, vars: Record<string, string>): string {
  return value
    .replace(/\{\{([#^])\s*([A-Z][A-Z0-9_]*)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g, (_, mark: string, key: string, inner: string) => (Boolean(vars[key] && vars[key] !== 'false') === (mark === '#') ? inner : ''))
    .replace(/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g, (_, key: string) => vars[key] ?? '')
}

export function autoVariables(game: GameTemplate, vars: Record<string, string>): Record<string, string> {
  const out = { ...vars }
  for (const v of game.variables) {
    if (!v.auto || vars[v.key] !== 'auto') continue
    const source = vars[v.auto.key] ?? ''
    out[v.key] = v.auto.rules.find((r) => new RegExp(r.pattern).test(source))?.value ?? v.auto.rules.at(-1)!.value
  }
  return out
}

export function containerEnv(game: GameTemplate, vars: Record<string, string>): string[] {
  const env = { ...game.env }
  for (const v of game.variables) Object.assign(env, v.options?.find((o) => o.value === vars[v.key])?.env)
  return Object.entries(env).flatMap(([key, raw]) => {
    const value = interpolate(raw, vars)
    return value === '' && /^\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}$/.test(raw) ? [] : [`${key}=${value}`]
  })
}

export function resolveVariables(game: GameTemplate, input: Record<string, string>, existing?: Record<string, string>): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const v of game.variables) {
    const locked = existing && (!v.editable || v.step === 'managed')
    raw[v.key] = String((locked ? existing[v.key] : input[v.key]) ?? (existing?.[v.key] || undefined) ?? v.default).trim()
  }
  const out: Record<string, string> = {}
  for (const v of game.variables) {
    if (!variableVisible(v, raw)) {
      out[v.key] = ''
      continue
    }
    const value = raw[v.key] || (v.random ? Array.from({ length: v.random.length }, () => v.random!.chars[randomInt(v.random!.chars.length)]).join('') : '')
    const fail = () => badRequest(`VARIABLE_INVALID:${v.key}`)
    if (value.length > 1024) fail()
    if (v.required && (value === '' || (v.type === 'boolean' && value !== 'true'))) fail()
    if (value !== '') {
      if (v.type === 'number' && !Number.isFinite(Number(value))) fail()
      if (v.type === 'boolean' && value !== 'true' && value !== 'false') fail()
      if (v.type === 'select' && !v.source && !v.options?.some((o) => o.value === value)) fail()
      if (v.source && !SOURCE_VALUE_PATTERN.test(value)) fail()
      if (v.pattern && !new RegExp(v.pattern).test(value)) fail()
    }
    out[v.key] = value
  }
  return out
}
