import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { eq } from 'drizzle-orm'
import { app } from './app'
import { db, now, runMigrations } from './db/client'
import { invites, servers, users } from './db/schema'
import { env } from './env'
import { loadGames } from './games/registry'
import { purgeExpiredSessions } from './lib/auth'
import { hashPassword, randomToken } from './lib/crypto'
import { recoverInstances } from './runtime/instances'
import { startScheduler } from './services/schedules'

async function bootstrapAdmin() {
  if (db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).get()) return
  if (env.adminUsername && env.adminPassword) {
    db.insert(users).values({ username: env.adminUsername, passwordHash: await hashPassword(env.adminPassword), role: 'admin', createdAt: now() }).run()
    console.log(`[hako] admin "${env.adminUsername}" created from ADMIN_USERNAME/ADMIN_PASSWORD`)
    return
  }
  const pending = db.select().from(invites).where(eq(invites.role, 'admin')).all().find((i) => !i.usedAt)
  const code = pending?.code ?? randomToken(12)
  if (!pending) db.insert(invites).values({ code, role: 'admin', createdAt: now() }).run()
  console.log(`[hako] no admin yet, create one at ${env.appUrl}/invite/${code}`)
}

function mergeTerrariaServers() {
  for (const row of db.select().from(servers).all()) {
    if (row.game === 'tmodloader') {
      const { VERSION, ...rest } = row.variables
      db.update(servers).set({ game: 'terraria', variables: { ...rest, TYPE: 'tmodloader', TML_VERSION: VERSION ?? '', VERSION: '' } }).where(eq(servers.id, row.id)).run()
    } else if (row.game === 'terraria' && !row.variables.TYPE) {
      db.update(servers).set({ variables: { ...row.variables, TYPE: 'vanilla' } }).where(eq(servers.id, row.id)).run()
    }
  }
}

runMigrations()
mergeTerrariaServers()
purgeExpiredSessions()
loadGames()
await bootstrapAdmin()
await recoverInstances()
startScheduler()

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => process.exit(0))

serve({ fetch: app.fetch, port: env.port, hostname: env.host, websocket: { server: new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 }) } }, (info) => {
  console.log(`[hako] api listening on http://${info.address}:${info.port}`)
})
