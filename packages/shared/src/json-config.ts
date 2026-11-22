type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function isObject(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseJsonConfig(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let root: unknown
  try {
    root = JSON.parse(text || '{}')
  } catch {
    return out
  }
  const walk = (node: unknown, prefix: string) => {
    if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) if (!key.startsWith('_')) walk(value, prefix ? `${prefix}.${key}` : key)
    } else if (!Array.isArray(node) && prefix) out[prefix] = node === null ? '' : String(node)
  }
  walk(root, '')
  return out
}

function coerce(previous: Json | undefined, value: string): Json {
  if (typeof previous === 'number') return value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : previous
  if (typeof previous === 'boolean') return value === 'true'
  if (typeof previous === 'string') return value
  if (value === '') return null
  if (value === 'true' || value === 'false') return value === 'true'
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
}

export function updateJsonConfig(text: string, changes: Record<string, string>): string {
  const root: unknown = JSON.parse(text || '{}')
  if (!isObject(root)) throw new Error('JSON_NOT_OBJECT')
  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split('.')
    let node: Record<string, Json> = root
    for (const part of parts.slice(0, -1)) {
      if (!isObject(node[part])) node[part] = {}
      node = node[part] as Record<string, Json>
    }
    const last = parts.at(-1)!
    node[last] = coerce(node[last], value)
  }
  return `${JSON.stringify(root, null, 2)}\n`
}

type ListItem = string | { username?: string; [key: string]: Json | undefined }

export function parseJsonList(text: string): string[] {
  try {
    const list = JSON.parse(text || '[]') as ListItem[]
    return Array.isArray(list) ? list.map((item) => (typeof item === 'string' ? item : (item?.username ?? ''))).filter(Boolean) : []
  } catch {
    return []
  }
}

export function writeJsonList(text: string, ids: string[]): string {
  let previous: ListItem[] = []
  try {
    const parsed = JSON.parse(text || '[]') as ListItem[]
    if (Array.isArray(parsed)) previous = parsed
  } catch {}
  const kept = new Map(previous.map((item) => [typeof item === 'string' ? item : (item?.username ?? ''), item]))
  return `${JSON.stringify(
    ids.map((id) => kept.get(id) ?? id),
    null,
    2,
  )}\n`
}
