export interface Cron {
  minute: Set<number>
  hour: Set<number>
  day: Set<number>
  month: Set<number>
  weekday: Set<number>
  anyDay: boolean
  anyWeekday: boolean
}

const FIELDS: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
]

function field(raw: string, [min, max]: [number, number]): Set<number> | null {
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    if (!m) return null
    const from = m[1] === '*' ? min : Number(m[2])
    const to = m[1] === '*' ? max : m[3] !== undefined ? Number(m[3]) : m[4] !== undefined ? max : from
    const step = m[4] !== undefined ? Number(m[4]) : 1
    if (from < min || to > max || from > to || step < 1) return null
    for (let v = from; v <= to; v += step) out.add(v)
  }
  return out
}

export function parseCron(expr: string): Cron | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const sets = parts.map((p, i) => field(p, FIELDS[i]!))
  if (sets.some((s) => !s)) return null
  const [minute, hour, day, month, weekday] = sets as Set<number>[]
  if (weekday!.has(7)) weekday!.add(0)
  return { minute: minute!, hour: hour!, day: day!, month: month!, weekday: weekday!, anyDay: parts[2] === '*', anyWeekday: parts[4] === '*' }
}

export function cronMatches(cron: Cron, date: Date): boolean {
  if (!cron.minute.has(date.getMinutes()) || !cron.hour.has(date.getHours()) || !cron.month.has(date.getMonth() + 1)) return false
  const day = cron.day.has(date.getDate())
  const weekday = cron.weekday.has(date.getDay())
  if (cron.anyDay || cron.anyWeekday) return day && weekday
  return day || weekday
}

export function nextCronRun(expr: string, from = new Date()): Date | null {
  const cron = parseCron(expr)
  if (!cron) return null
  const at = new Date(from)
  at.setSeconds(0, 0)
  for (let i = 0; i < 366 * 24 * 60; i++) {
    at.setMinutes(at.getMinutes() + 1)
    if (cronMatches(cron, at)) return at
  }
  return null
}
