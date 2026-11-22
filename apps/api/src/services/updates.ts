import type { ServerUpdates } from '@hako/shared'
import { addonKind, addonUpdates } from '../addons/manager'
import { db } from '../db/client'
import { servers } from '../db/schema'
import { badRequest } from '../lib/http'
import { type ServerRow, imageOutdated, instance, pullImage, serverImage } from '../runtime/instances'

const INTERVAL = 6 * 60 * 60 * 1000
const state = new Map<string, ServerUpdates>()
const pulling = new Set<string>()

export function updatesOf(id: string): ServerUpdates {
  return state.get(id) ?? { image: false, addons: 0, checkedAt: null }
}

export async function checkUpdates(server: ServerRow, images = new Map<string, Promise<boolean>>()): Promise<ServerUpdates> {
  const image = serverImage(server)
  if (image && !images.has(image)) images.set(image, imageOutdated(image))
  const [outdated, addons] = await Promise.all([image ? images.get(image)! : false, addonKind(server) ? addonUpdates(server).then((u) => u.length, () => 0) : 0])
  const next = { image: outdated, addons, checkedAt: new Date().toISOString() }
  state.set(server.id, next)
  return next
}

export function updateImage(server: ServerRow) {
  const image = serverImage(server)
  if (!image) badRequest('GAME_UNKNOWN')
  if (pulling.has(server.id)) badRequest('IMAGE_PULLING')
  pulling.add(server.id)
  const target = instance(server.id)
  pullImage(image, (line) => target.notice(line))
    .then(() => {
      state.set(server.id, { ...updatesOf(server.id), image: false })
      target.notice(`${image} is up to date, the next start uses it`)
    })
    .catch((e) => target.notice(`pull failed: ${e instanceof Error ? e.message : e}`))
    .finally(() => pulling.delete(server.id))
}

async function checkAll() {
  const images = new Map<string, Promise<boolean>>()
  for (const row of db.select().from(servers).all()) await checkUpdates(row, images).catch(() => {})
}

export function startUpdateChecks() {
  setTimeout(() => {
    void checkAll()
    setInterval(() => void checkAll(), INTERVAL)
  }, 60_000)
}
