import { RiArrowDownSLine, RiChat3Fill, RiLoginBoxFill, RiLogoutBoxFill, RiSendPlaneFill } from '@remixicon/react'
import type { Server } from '@hako/shared'
import { Button, Card, cn } from '@hako/ui'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ChatEntry, type ChatSpec, chatParser } from '../../lib/chat'
import type { ServerSocket } from '../../lib/server-socket'
import { readStorage, writeStorage } from '../../lib/storage'
import { PlayerHead } from './players'

const LIMIT = 300
const SHUT_KEY = 'hako:chat-collapsed'

export function ServerChat({ server, socket, chat, players, avatar, compact }: { server: Server; socket: ServerSocket; chat: ChatSpec; players: Parameters<typeof chatParser>[1]; avatar?: string; compact: boolean }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState('')
  const [shut, setShut] = useState(() => readStorage(SHUT_KEY) === 'true')
  const toggleShut = (next: boolean) => {
    setShut(next)
    writeStorage(SHUT_KEY, String(next))
  }
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const allowed = server.access.manage || server.access.permissions.includes('console')
  const canSend = Boolean(chat.say) && allowed && server.status !== 'offline'

  const rules = JSON.stringify([chat, players])
  const { onLog, buffer } = socket
  useEffect(() => {
    const parse = chatParser(...(JSON.parse(rules) as Parameters<typeof chatParser>))
    let pending = ''
    const read = (text: string) => {
      const lines = (pending + text).split('\n')
      pending = lines.pop() ?? ''
      return lines.map(parse).filter((e): e is ChatEntry => e !== null)
    }
    setEntries(read(buffer()).slice(-LIMIT))
    return onLog((chunk, reset) => {
      if (reset) {
        pending = ''
        setEntries(read(chunk).slice(-LIMIT))
        return
      }
      const fresh = read(chunk)
      if (fresh.length) setEntries((prev) => [...prev, ...fresh].slice(-LIMIT))
    })
  }, [onLog, buffer, rules])

  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const message = draft.trim()
    if (!message || !canSend) return
    socket.send(chat.say!.replaceAll('{{MESSAGE}}', message))
    setDraft('')
    pinned.current = true
  }

  const messages = entries.filter((e) => e.kind === 'message').length
  return (
    <Card className={cn('flex shrink-0 flex-col overflow-hidden', !shut && (compact ? 'h-64' : 'h-80'))}>
      <button type="button" aria-expanded={!shut} onClick={() => toggleShut(!shut)} className={cn('flex w-full cursor-pointer items-center gap-2 px-4 pt-3 text-left text-sm text-muted-foreground [&_svg]:size-4', shut ? 'pb-3' : 'pb-2')}>
        <RiChat3Fill />
        <span className="font-medium text-foreground">{t('chat.title')}</span>
        <span className="ml-auto text-xs tabular-nums text-subtle-foreground">{t('chat.count', { count: messages })}</span>
        <RiArrowDownSLine className={cn('transition-transform', shut && '-rotate-90')} />
      </button>
      {shut ? null : (
      <>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        className="min-h-0 flex-1 overflow-y-auto px-2"
      >
        {entries.length ? (
          <ul className="flex flex-col py-1">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 rounded-md px-2 py-1 text-[0.8125rem] hover:bg-muted">
                <span className="w-14 shrink-0 pt-px font-mono text-xs tabular-nums text-subtle-foreground">{e.time ?? ''}</span>
                {e.kind === 'join' || e.kind === 'leave' ? (
                  <span className={cn('flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5', e.kind === 'join' ? 'text-success' : 'text-subtle-foreground')}>
                    {e.kind === 'join' ? <RiLoginBoxFill /> : <RiLogoutBoxFill />}
                    <span className="truncate">{t(e.kind === 'join' ? 'chat.joined' : 'chat.left', { name: e.name })}</span>
                  </span>
                ) : e.kind === 'server' ? (
                  <span className="min-w-0 break-words italic text-accent">{e.text}</span>
                ) : (
                  <span className="flex min-w-0 items-start gap-2">
                    <PlayerHead serverId={server.id} name={e.name ?? '?'} avatar={avatar} className="mt-px size-4 rounded-[3px] text-[0.95rem]" />
                    <span className="min-w-0 break-words">
                      <span className="mr-1.5 font-semibold">{e.name}</span>
                      <span className={e.kind === 'command' ? 'font-mono text-muted-foreground' : ''}>{e.text}</span>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="grid h-full place-items-center text-sm text-subtle-foreground">{t('chat.empty')}</p>
        )}
      </div>
      {chat.say && allowed ? (
        <form onSubmit={submit} className="flex gap-2 p-2.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canSend}
            placeholder={canSend ? t('chat.placeholder') : t('chat.offline')}
            aria-label={t('chat.placeholder')}
            className="h-9 min-w-0 flex-1 rounded-lg bg-field px-3 text-sm outline-none placeholder:text-subtle-foreground focus:bg-field-hover disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button type="submit" variant="accent" disabled={!canSend || !draft.trim()}>
            <RiSendPlaneFill />
            {t('chat.send')}
          </Button>
        </form>
      ) : null}
      </>
      )}
    </Card>
  )
}
