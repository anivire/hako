import path from 'node:path'

function str(name: string, fallback = ''): string {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function int(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const dataDir = path.resolve(str('DATA_DIR', './data'))

export const env = {
  production: process.env.NODE_ENV === 'production',
  port: int('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  appUrl: str('APP_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  dataDir,
  databasePath: path.resolve(str('DATABASE_PATH', path.join(dataDir, 'hako.db'))),
  serversDir: path.resolve(str('SERVERS_DIR', path.join(dataDir, 'servers'))),
  gamesDir: path.resolve(str('GAMES_DIR', path.join(dataDir, 'games'))),
  dockerSocket: str('DOCKER_SOCKET', process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'),
  webDist: str('WEB_DIST'),
  sessionDays: int('SESSION_DAYS', 30),
  adminUsername: str('ADMIN_USERNAME'),
  adminPassword: str('ADMIN_PASSWORD'),
  userAgent: str('USER_AGENT', 'hako'),
  curseforgeApiKey: str('CURSEFORGE_API_KEY'),
}

export const secureCookies = env.appUrl.startsWith('https://')
