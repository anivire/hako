const ESCAPES: Record<string, string> = { t: '\t', n: '\n', r: '\r', f: '\f' }

function unescape(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, seq: string) => (seq.length === 5 ? String.fromCharCode(parseInt(seq.slice(1), 16)) : (ESCAPES[seq] ?? seq)))
}

function escape(value: string, key = false): string {
  let out = ''
  for (const [i, ch] of [...value].entries()) {
    const code = ch.codePointAt(0)!
    if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch === '=' || ch === ':' || ch === '#' || ch === '!') out += `\\${ch}`
    else if (ch === ' ' && (key || i === 0)) out += '\\ '
    else if (code < 0x20 || code > 0x7e) out += [...ch].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')
    else out += ch
  }
  return out
}

function splitLine(line: string): { key: string; value: string } | null {
  const trimmed = line.replace(/^\s+/, '')
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith(';') || /^\[[^\]]*\]\s*$/.test(trimmed)) return null
  let i = 0
  while (i < trimmed.length) {
    const ch = trimmed[i]!
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '=' || ch === ':' || /\s/.test(ch)) break
    i += 1
  }
  const key = trimmed.slice(0, i)
  const rest = trimmed.slice(i).replace(/^\s*[=:]?\s*/, '')
  return { key: unescape(key), value: unescape(rest) }
}

export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const entry = splitLine(line)
    if (entry) out[entry.key] = entry.value
  }
  return out
}

export function updateProperties(text: string, changes: Record<string, string>, raw = false): string {
  const write = (key: string, value: string) => (raw ? `${key}=${value.replace(/[\r\n]+/g, ' ')}` : `${escape(key, true)}=${escape(value)}`)
  const pending = new Map(Object.entries(changes))
  const lines = text.split(/\r?\n/).map((line) => {
    const entry = splitLine(line)
    if (!entry || !pending.has(entry.key)) return line
    const value = pending.get(entry.key)!
    pending.delete(entry.key)
    return write(entry.key, value)
  })
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  for (const [key, value] of pending) lines.push(write(key, value))
  return `${lines.join('\n')}\n`
}
