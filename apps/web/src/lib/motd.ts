export const MOTD_COLORS: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF',
}

export interface MotdSegment {
  text: string
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  obfuscated: boolean
}

const DEFAULT_COLOR = '#AAAAAA'

export function parseMotd(source: string): MotdSegment[][] {
  return source
    .split('\n')
    .slice(0, 2)
    .map((line) => {
      const out: MotdSegment[] = []
      let style: Omit<MotdSegment, 'text'> = { color: DEFAULT_COLOR, bold: false, italic: false, underline: false, strike: false, obfuscated: false }
      let buffer = ''
      const flush = () => {
        if (buffer) out.push({ ...style, text: buffer })
        buffer = ''
      }
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!
        const code = line[i + 1]?.toLowerCase()
        if (ch === '§' && code) {
          flush()
          if (code in MOTD_COLORS) style = { color: MOTD_COLORS[code]!, bold: false, italic: false, underline: false, strike: false, obfuscated: false }
          else if (code === 'l') style = { ...style, bold: true }
          else if (code === 'o') style = { ...style, italic: true }
          else if (code === 'n') style = { ...style, underline: true }
          else if (code === 'm') style = { ...style, strike: true }
          else if (code === 'k') style = { ...style, obfuscated: true }
          else if (code === 'r') style = { color: DEFAULT_COLOR, bold: false, italic: false, underline: false, strike: false, obfuscated: false }
          i += 1
          continue
        }
        buffer += ch
      }
      flush()
      return out
    })
}

export function visibleLength(line: string): number {
  return line.replace(/§./g, '').length
}
