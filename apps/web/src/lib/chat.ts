import type { GameTemplate } from '@hako/shared'
import { plain } from './log-highlight'

export type ChatSpec = NonNullable<GameTemplate['console']['chat']>
type PlayersRegex = GameTemplate['console']['players']

export interface ChatEntry {
  id: number
  time: string | null
  kind: 'message' | 'command' | 'server' | 'join' | 'leave'
  name: string | null
  text: string
}

const TIME = /\b(\d{2}:\d{2}:\d{2})\b/

export function chatParser(chat: ChatSpec, players: PlayersRegex) {
  const rules: [ChatEntry['kind'], RegExp][] = [
    ['message', new RegExp(chat.message)],
    ...(chat.command ? [['command', new RegExp(chat.command)] as [ChatEntry['kind'], RegExp]] : []),
    ...(chat.server ? [['server', new RegExp(chat.server)] as [ChatEntry['kind'], RegExp]] : []),
    ...(players ? ([['join', new RegExp(players.join)], ['leave', new RegExp(players.leave)]] as [ChatEntry['kind'], RegExp][]) : []),
  ]
  let id = 0
  return (line: string): ChatEntry | null => {
    const text = plain(line)
    for (const [kind, rule] of rules) {
      const m = rule.exec(text)
      if (!m) continue
      const time = TIME.exec(text)?.[1] ?? null
      id += 1
      if (kind === 'server') return { id, time, kind, name: null, text: m[1] ?? '' }
      if (kind === 'join' || kind === 'leave') return { id, time, kind, name: m[1] ?? '', text: '' }
      return { id, time, kind, name: m[1] ?? '', text: m[2] ?? '' }
    }
    return null
  }
}
