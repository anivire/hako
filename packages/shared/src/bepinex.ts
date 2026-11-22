export interface BepinexEntry {
  id: string
  section: string
  key: string
  value: string
  description: string
  type: string
  default: string | null
  options: string[] | null
  flags: boolean
  min: number | null
  max: number | null
}

export interface BepinexFile {
  plugin: string | null
  version: string | null
  sections: { name: string; entries: BepinexEntry[] }[]
}

type Line = { kind: 'section'; name: string } | { kind: 'setting'; key: string; value: string } | { kind: 'meta'; text: string } | { kind: 'description'; text: string } | { kind: 'other' }

function classify(line: string): Line {
  const trimmed = line.trim()
  const section = /^\[(.+)\]$/.exec(trimmed)
  if (section) return { kind: 'section', name: section[1]!.trim() }
  if (trimmed.startsWith('##')) return { kind: 'description', text: trimmed.replace(/^##\s?/, '') }
  if (trimmed.startsWith('#')) return { kind: 'meta', text: trimmed.replace(/^#\s?/, '') }
  const eq = trimmed.indexOf('=')
  if (eq > 0) return { kind: 'setting', key: trimmed.slice(0, eq).trim(), value: trimmed.slice(eq + 1).trim() }
  return { kind: 'other' }
}

export function bepinexId(section: string, key: string) {
  return JSON.stringify([section, key])
}

export function parseBepinex(text: string): BepinexFile {
  const file: BepinexFile = { plugin: null, version: null, sections: [] }
  let section: BepinexFile['sections'][number] | null = null
  let meta = { description: [] as string[], type: '', default: null as string | null, options: null as string[] | null, flags: false, min: null as number | null, max: null as number | null }
  const reset = () => (meta = { description: [], type: '', default: null, options: null, flags: false, min: null, max: null })
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = classify(raw)
    if (line.kind === 'section') {
      section = { name: line.name, entries: [] }
      file.sections.push(section)
      reset()
    } else if (line.kind === 'description') {
      const header = /^Settings file was created by plugin (.+?) v(\S+)$/.exec(line.text)
      if (!section && header) {
        file.plugin = header[1]!
        file.version = header[2]!
      } else if (section) meta.description.push(line.text)
    } else if (line.kind === 'meta') {
      const [label, ...rest] = line.text.split(':')
      const value = rest.join(':').trim()
      if (label === 'Setting type') meta.type = value
      else if (label === 'Default value') meta.default = value
      else if (label === 'Acceptable values') meta.options = value.split(',').map((v) => v.trim()).filter(Boolean)
      else if (label === 'Acceptable value range') {
        const range = /From\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)/i.exec(value)
        if (range) [meta.min, meta.max] = [Number(range[1]), Number(range[2])]
      } else if (/^Multiple values can be set/i.test(line.text)) meta.flags = true
    } else if (line.kind === 'setting' && section) {
      section.entries.push({ id: bepinexId(section.name, line.key), section: section.name, key: line.key, value: line.value, description: meta.description.join('\n').trim(), type: meta.type, default: meta.default, options: meta.options, flags: meta.flags, min: meta.min, max: meta.max })
      reset()
    }
  }
  file.sections = file.sections.filter((s) => s.entries.length)
  return file
}

export function updateBepinex(text: string, changes: Record<string, string>): string {
  let section = ''
  return text
    .split(/\r?\n/)
    .map((raw) => {
      const line = classify(raw)
      if (line.kind === 'section') section = line.name
      if (line.kind !== 'setting') return raw
      const id = bepinexId(section, line.key)
      return id in changes ? `${line.key} = ${changes[id]!.replace(/[\r\n]+/g, ' ')}` : raw
    })
    .join('\n')
}

export function parseIdList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
}

export function writeIdList(text: string, ids: string[]): string {
  const comments = text.split(/\r?\n/).filter((l) => l.trim().startsWith('//'))
  return `${[...comments, ...ids].join('\n')}\n`
}
