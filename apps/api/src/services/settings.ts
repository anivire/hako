import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { settings } from '../db/schema'
import { env } from '../env'

export function getSetting(key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
}

export function setSetting(key: string, value: string | null) {
  if (value === null || value === '') db.delete(settings).where(eq(settings.key, key)).run()
  else db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run()
}

export function curseforgeKey(): string {
  return getSetting('curseforgeApiKey') ?? env.curseforgeApiKey
}
