import fs from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { and, like, ne } from 'drizzle-orm'
import { db } from './db/client'
import { users } from './db/schema'
import { env } from './env'
import { type AppEnv, requireAuth } from './lib/auth'
import { dockerAvailable, dockerResources } from './runtime/instances'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { gameRoutes, serverRoutes, shareRoutes } from './routes/servers'

export const app = new Hono<AppEnv>()

app.use(logger())
app.use(secureHeaders({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false, contentSecurityPolicy: undefined }))
app.use(async (c, next) => {
  await next()
  c.header('X-Robots-Tag', 'noindex, nofollow')
})

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/system', requireAuth, async (c) => c.json({ docker: await dockerAvailable(), ...(await dockerResources()) }))
app.get('/api/users', requireAuth, (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 32)
  const me = c.get('user').id
  if (!q) return c.json([])
  const rows = db.select({ id: users.id, username: users.username }).from(users).where(and(like(users.username, `%${q.replace(/[%_\\]/g, '')}%`), ne(users.id, me))).orderBy(users.username).limit(10).all()
  return c.json(rows)
})
app.route('/api/auth', authRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/games', gameRoutes)
app.route('/api/servers', serverRoutes)
app.route('/api/share', shareRoutes)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

if (env.webDist && fs.existsSync(env.webDist)) {
  const root = path.relative(process.cwd(), env.webDist) || '.'
  const indexHtml = fs.readFileSync(path.join(env.webDist, 'index.html'), 'utf8').replaceAll('__APP_URL__', env.appUrl)
  app.use('/assets/*', serveStatic({ root, onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }))
  app.all('/assets/*', (c) => c.text('Not found', 404))
  app.get('/', (c) => {
    c.header('Cache-Control', 'no-cache')
    return c.html(indexHtml)
  })
  app.get('/index.html', (c) => c.redirect('/'))
  app.use('*', serveStatic({ root, onFound: (_path, c) => c.header('Cache-Control', 'no-cache') }))
  app.get('*', (c) => {
    c.header('Cache-Control', 'no-cache')
    return c.html(indexHtml)
  })
}

app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
  console.error(error)
  return c.json({ error: 'Internal error' }, 500)
})
