import { setTimeout as sleep } from 'node:timers/promises'
import { and, eq } from 'drizzle-orm'
import { type Schedule, type ScheduleAction, type ScheduleInput, cronMatches, nextCronRun, parseCron } from '@hako/shared'
import { db, now } from '../db/client'
import { schedules, servers } from '../db/schema'
import { interpolate, serverGame } from '../games/registry'
import { badRequest, notFound } from '../lib/http'
import { instance, statusOf } from '../runtime/instances'
import { createBackup } from './backups'

type ScheduleRow = typeof schedules.$inferSelect

const running = new Set<number>()

function toSchedule(row: ScheduleRow): Schedule {
  return { id: row.id, name: row.name, cron: row.cron, actions: row.actions, enabled: row.enabled, lastRunAt: row.lastRunAt, lastError: row.lastError, nextRunAt: row.enabled ? (nextCronRun(row.cron)?.toISOString() ?? null) : null, running: running.has(row.id) }
}

export function listSchedules(serverId: string) {
  return { schedules: db.select().from(schedules).where(eq(schedules.serverId, serverId)).orderBy(schedules.id).all().map(toSchedule), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
}

function find(serverId: string, id: number): ScheduleRow {
  const row = db.select().from(schedules).where(and(eq(schedules.serverId, serverId), eq(schedules.id, id))).get()
  if (!row) notFound('SCHEDULE_NOT_FOUND')
  return row
}

export function createSchedule(serverId: string, input: ScheduleInput) {
  db.insert(schedules).values({ serverId, ...input, createdAt: now() }).run()
  return listSchedules(serverId)
}

export function updateSchedule(serverId: string, id: number, input: ScheduleInput) {
  find(serverId, id)
  db.update(schedules).set(input).where(eq(schedules.id, id)).run()
  return listSchedules(serverId)
}

export function deleteSchedule(serverId: string, id: number) {
  find(serverId, id)
  db.delete(schedules).where(eq(schedules.id, id)).run()
  return listSchedules(serverId)
}

function loadServer(id: string) {
  const row = db.select().from(servers).where(eq(servers.id, id)).get()
  if (!row) throw new Error('server is gone')
  return row
}

async function runAction(serverId: string, action: ScheduleAction) {
  const target = instance(serverId)
  const online = statusOf(serverId) !== 'offline'
  switch (action.type) {
    case 'command':
      if (online) target.command(action.command)
      return
    case 'say': {
      const say = serverGame(loadServer(serverId))?.console.chat?.say
      if (online && say) target.command(interpolate(say, { MESSAGE: action.message.replace(/[\r\n]+/g, ' ') }))
      return
    }
    case 'wait':
      await sleep(action.seconds * 1000)
      return
    case 'backup':
      await createBackup(loadServer(serverId))
      return
    case 'restart':
      if (online) await target.power('restart', loadServer(serverId))
      return
    default:
      await target.power(action.type, loadServer(serverId))
  }
}

export async function runSchedule(row: ScheduleRow) {
  if (running.has(row.id)) badRequest('SCHEDULE_RUNNING')
  running.add(row.id)
  const target = instance(row.serverId)
  target.notice(`schedule "${row.name}" started`)
  let error: string | null = null
  try {
    for (const action of row.actions) await runAction(row.serverId, action)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    target.notice(`schedule "${row.name}" failed: ${error}`)
  } finally {
    running.delete(row.id)
    db.update(schedules).set({ lastRunAt: now(), lastError: error }).where(eq(schedules.id, row.id)).run()
  }
}

export function runScheduleNow(serverId: string, id: number) {
  const row = find(serverId, id)
  if (running.has(row.id)) badRequest('SCHEDULE_RUNNING')
  runSchedule(row).catch(() => {})
  return listSchedules(serverId)
}

function tick() {
  const at = new Date()
  for (const row of db.select().from(schedules).where(eq(schedules.enabled, true)).all()) {
    const cron = parseCron(row.cron)
    if (cron && cronMatches(cron, at) && !running.has(row.id)) runSchedule(row).catch(() => {})
  }
}

export function startScheduler() {
  const arm = () => setTimeout(() => {
    tick()
    arm()
  }, 60_000 - (Date.now() % 60_000) + 500)
  arm()
}
