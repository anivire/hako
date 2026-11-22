const LEVEL_COLORS: Record<string, string> = { TRACE: '90', DEBUG: '90', INFO: '36', WARN: '33', WARNING: '33', ERROR: '31', SEVERE: '31', FATAL: '1;31' }
const LINE = /^(\r?(?:\x1b\[K)?)(\[\d{2}:\d{2}:\d{2}(?:\.\d+)?)( |\] \[)([^\]]*?)(\/)?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|SEVERE|FATAL)(\]:?)([\s\S]*)$/

export type LogFilter = 'all' | 'error' | 'warn' | 'info'

const LEVEL = /^\[\d{2}:\d{2}:\d{2}(?:\.\d+)?(?: |\] \[)[^\]]*?\/?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|SEVERE|FATAL)\]/
const GROUPS: Record<string, Exclude<LogFilter, 'all'> | 'debug'> = { TRACE: 'debug', DEBUG: 'debug', INFO: 'info', WARN: 'warn', WARNING: 'warn', ERROR: 'error', SEVERE: 'error', FATAL: 'error' }

function plain(line: string): string {
  const text = line.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[=>]/g, '').replace(/\r$/, '')
  return text.slice(text.lastIndexOf('\r') + 1)
}

export interface FilterState {
  pending: string
  level: string | null
}

export function filterLog(chunk: string, filter: Exclude<LogFilter, 'all'>, state: FilterState): string {
  const lines = (state.pending + chunk).split('\n')
  state.pending = lines.pop() ?? ''
  const out: string[] = []
  for (const line of lines) {
    const text = plain(line)
    const match = LEVEL.exec(text)
    if (match) state.level = GROUPS[match[1]!] ?? null
    else if (!text.trim()) continue
    if (state.level === filter) out.push(`${line.replace(/\r$/, '')}\r\n`)
  }
  return out.join('')
}

export function highlight(chunk: string): string {
  return chunk
    .split('\n')
    .map((line) => {
      if (line.includes('\x1b[3') || line.includes('\x1b[9')) return line
      const m = LINE.exec(line)
      if (!m) return line
      const [, lead, time, sep, thread, slash, level, close, rest] = m
      const color = LEVEL_COLORS[level!]!
      const body = level === 'WARN' || level === 'WARNING' || level === 'ERROR' || level === 'SEVERE' || level === 'FATAL' ? `\x1b[${color}m${rest}\x1b[0m` : rest
      return `${lead}\x1b[90m${time}${sep}${thread}${slash ?? ''}\x1b[0m\x1b[${color}m${level}\x1b[0m\x1b[90m${close}\x1b[0m${body}`
    })
    .join('\n')
}
