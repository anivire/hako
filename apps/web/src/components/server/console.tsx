import {
  RiArrowDownFill,
  RiTeamFill,
  RiArrowUpDownFill,
  RiCpuFill,
  RiDatabase2Fill,
  RiHardDrive3Fill,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiDownload2Fill,
  RiEraserFill,
  RiFileCopyFill,
  RiFullscreenExitFill,
  RiFullscreenFill,
  RiSearchFill,
  RiSendPlaneFill,
  RiZoomInFill,
  RiZoomOutFill,
} from '@remixicon/react'
import type { Server, ServerStats } from '@hako/shared'
import { Button, Card, Spinner, StatusDot, Tooltip, cn, toast } from '@hako/ui'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatBytes } from '../../lib/format'
import { type ServerSocket, SAMPLES } from '../../lib/server-socket'
import { readStorage, writeStorage } from '../../lib/storage'
import { StatCard } from './metric-chart'
import { CONSOLE_BACKGROUND, ConsoleTerminal, type TerminalHandle } from './terminal'
import type { LogFilter } from '../../lib/log-highlight'

const FONT_KEY = 'hako:console-font'
const FILTERS: LogFilter[] = ['all', 'error', 'warn', 'info']
const FONT_SIZES = [11, 12, 13, 14, 16, 18]

function rates(stats: ServerStats[], key: 'rx' | 'tx') {
  return stats.slice(1).map((cur, i) => {
    const prev = stats[i]!
    const seconds = (cur.at - prev.at) / 1000
    return seconds > 0 ? Math.max(0, (cur[key] - prev[key]) / seconds) : 0
  })
}

function Metrics({ server, stats }: { server: Server; stats: ServerStats[] }) {
  const { t } = useTranslation()
  const last = stats.at(-1)
  const live = server.status !== 'offline' && last
  const memoryLimit = last?.memoryLimit || server.memory * 1024 * 1024
  const cpu = stats.map((s) => s.cpu)
  const rx = rates(stats, 'rx')
  const tx = rates(stats, 'tx')
  const netMax = Math.max(1024, ...rx, ...tx) * 1.2
  const usage = useQuery({ queryKey: ['usage', server.id], queryFn: () => api.usage(server.id), refetchInterval: 30_000 })
  const idle = server.status === 'offline' ? t('console.noData') : t('console.waiting')
  const percent = (v: number) => `${v.toFixed(v < 10 ? 2 : 1)}%`
  const memoryPoints = stats.map((s) => (s.memory / memoryLimit) * 100)
  const inColor = 'var(--color-accent)'
  const outColor = 'var(--color-muted-foreground)'
  const warming = server.status !== 'offline' && stats.length < 2
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
      <StatCard
        title={t('console.cpu')}
        icon={<RiCpuFill />}
        value={live ? percent(last.cpu) : '—'}
        detail={live ? null : idle}
        series={live ? [{ label: t('console.cpu'), color: 'var(--color-accent)', points: cpu }] : undefined}
        max={Math.max(100, ...cpu)}
        format={percent}
        length={SAMPLES}
        loading={warming}
      />
      <StatCard
        title={t('console.memory')}
        icon={<RiDatabase2Fill />}
        value={live ? percent((last.memory / memoryLimit) * 100) : '—'}
        detail={live ? `${formatBytes(last.memory)} / ${formatBytes(memoryLimit)}` : idle}
        series={live ? [{ label: t('console.memory'), color: 'var(--color-accent)', points: memoryPoints }] : undefined}
        max={100}
        format={percent}
        length={SAMPLES}
        loading={warming}
      />
      <StatCard
        title={t('console.network')}
        icon={<RiArrowUpDownFill />}
        value={live && rx.length ? `${formatBytes(rx.at(-1)! + tx.at(-1)!)}/s` : '—'}
        detail={
          live && rx.length ? (
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: inColor }} />↓ {formatBytes(rx.at(-1)!)}/s
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: outColor }} />↑ {formatBytes(tx.at(-1)!)}/s
              </span>
            </span>
          ) : (
            idle
          )
        }
        series={
          live
            ? [
                { label: t('console.networkIn'), color: inColor, points: rx },
                { label: t('console.networkOut'), color: outColor, points: tx },
              ]
            : undefined
        }
        max={netMax}
        format={(v) => `${formatBytes(v)}/s`}
        length={SAMPLES - 1}
        loading={server.status !== 'offline' && rx.length < 2}
      />
      <StatCard title={t('console.storage')} icon={<RiHardDrive3Fill />} value={usage.data ? formatBytes(usage.data.bytes) : '—'} detail={t('console.storageHint')} loading={usage.isPending} />
    </div>
  )
}

function Players({ server, players, heads }: { server: Server; players: string[]; heads: boolean }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        <RiTeamFill />
        {t('console.online')}
        <span className="font-semibold tabular-nums text-foreground">{players.length}</span>
      </span>
      {players.length ? (
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {players.map((name) => (
            <span key={name} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground/[0.05] pl-1 pr-2.5 text-[0.8125rem]">
              {heads ? (
                <img src={api.addonIcon(server.id, `https://mc-heads.net/avatar/${encodeURIComponent(name)}/32`)} alt="" loading="lazy" className="size-5 rounded-full bg-field [image-rendering:pixelated]" />
              ) : (
                <span aria-hidden className="grid size-5 place-items-center rounded-full bg-accent-soft text-[0.6875rem] font-semibold uppercase text-accent">
                  {name.slice(0, 1)}
                </span>
              )}
              {name}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-sm text-subtle-foreground">{t('console.nobodyOnline')}</span>
      )}
    </Card>
  )
}

function ToolButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Tooltip content={label}>
      <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
        {children}
      </Button>
    </Tooltip>
  )
}

function useCommandHistory(id: string) {
  const key = `hako:history:${id}`
  const [items, setItems] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(readStorage(key) ?? '[]') as unknown
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 100) : []
    } catch {
      return []
    }
  })
  const push = (command: string) => {
    const next = [command, ...items.filter((x) => x !== command)].slice(0, 100)
    setItems(next)
    writeStorage(key, JSON.stringify(next))
  }
  return { items, push }
}

export function ServerConsole({ server, socket, playerList }: { server: Server; socket: ServerSocket; playerList: 'minecraft' | 'plain' | null }) {
  const { t } = useTranslation()
  const terminal = useRef<TerminalHandle>(null)
  const input = useRef<HTMLInputElement>(null)
  const [command, setCommand] = useState('')
  const [cursor, setCursor] = useState(-1)
  const history = useCommandHistory(server.id)
  const [query, setQuery] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [scrolledUp, setScrolledUp] = useState(false)
  const [filter, setFilter] = useState<LogFilter>('all')
  const [filteredEmpty, setFilteredEmpty] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const stored = Number(readStorage(FONT_KEY))
    return FONT_SIZES.includes(stored) ? stored : 13
  })
  const allowed = server.access.manage || server.access.permissions.includes('console')
  const offline = server.status === 'offline' || !allowed

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const changeFont = (step: number) => {
    const next = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(fontSize) + step))]!
    setFontSize(next)
    writeStorage(FONT_KEY, String(next))
  }
  const find = (direction: 'next' | 'previous') => {
    if (!query) return
    setNotFound(!terminal.current?.search(query, direction))
  }
  const copy = async () => {
    const text = terminal.current?.selection() || terminal.current?.text() || ''
    await navigator.clipboard.writeText(text)
    toast.success(t('console.copied'))
  }
  const download = () => {
    const blob = new Blob([terminal.current?.text() ?? ''], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${server.name.replace(/[^\w.-]+/g, '_') || server.id}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = command.trim()
    if (!value || offline) return
    socket.send(value)
    history.push(value)
    setCursor(-1)
    setCommand('')
    terminal.current?.scrollToBottom()
  }
  const recall = (step: number) => {
    const next = Math.max(-1, Math.min(history.items.length - 1, cursor + step))
    setCursor(next)
    setCommand(next < 0 ? '' : history.items[next]!)
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Metrics server={server} stats={socket.stats} />
      {playerList && server.status !== 'offline' ? <Players server={server} players={socket.players} heads={playerList === 'minecraft'} /> : null}
      <Card className={cn('flex flex-1 flex-col overflow-hidden', fullscreen && 'fixed inset-0 z-50 rounded-none')}>
        <div className="flex flex-wrap items-center gap-2 p-2.5 lg:grid lg:grid-cols-[1fr_minmax(16rem,26rem)_1fr]">
          <div className="flex flex-wrap items-center gap-1.5 lg:justify-self-start">
            <span className={cn('flex h-7 items-center gap-2 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium', socket.connected ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
              <StatusDot tone={socket.connected ? 'success' : 'warning'} pulse={!socket.connected} />
              {socket.connected ? t('console.live') : t('console.connecting')}
            </span>
            <div role="radiogroup" aria-label={t('console.filter')} className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'h-7 cursor-pointer rounded-full px-3 text-[0.8125rem] font-medium transition-colors',
                    filter === f ? 'bg-accent-soft text-accent' : 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground',
                  )}
                >
                  {t(`console.filters.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="relative order-first w-full lg:order-none lg:w-auto">
            <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setNotFound(false)
                if (!e.target.value) terminal.current?.clearSearch()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  find(e.shiftKey ? 'previous' : 'next')
                } else if (e.key === 'Escape') {
                  setQuery('')
                  terminal.current?.clearSearch()
                }
              }}
              placeholder={t('console.search')}
              aria-label={t('console.search')}
              className={cn('h-9 w-full rounded-lg bg-foreground/[0.05] pl-9 pr-16 text-sm outline-none placeholder:text-subtle-foreground focus:bg-foreground/[0.08]', notFound && 'text-danger')}
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2">
              <button type="button" aria-label={t('console.previous')} onClick={() => find('previous')} className="grid size-6 cursor-pointer place-items-center rounded text-muted-foreground hover:text-foreground">
                <RiArrowUpSLine className="size-4" />
              </button>
              <button type="button" aria-label={t('console.next')} onClick={() => find('next')} className="grid size-6 cursor-pointer place-items-center rounded text-muted-foreground hover:text-foreground">
                <RiArrowDownSLine className="size-4" />
              </button>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:justify-self-end">
            <div className="flex items-center">
              <ToolButton label={t('console.smaller')} onClick={() => changeFont(-1)} disabled={fontSize === FONT_SIZES[0]}>
                <RiZoomOutFill />
              </ToolButton>
              <ToolButton label={t('console.larger')} onClick={() => changeFont(1)} disabled={fontSize === FONT_SIZES.at(-1)}>
                <RiZoomInFill />
              </ToolButton>
              <ToolButton label={t('console.copy')} onClick={() => void copy()}>
                <RiFileCopyFill />
              </ToolButton>
              <ToolButton label={t('console.download')} onClick={download}>
                <RiDownload2Fill />
              </ToolButton>
              <ToolButton label={t('console.clear')} onClick={() => terminal.current?.clear()}>
                <RiEraserFill />
              </ToolButton>
              <ToolButton label={fullscreen ? t('console.exitFullscreen') : t('console.fullscreen')} onClick={() => setFullscreen(!fullscreen)}>
                {fullscreen ? <RiFullscreenExitFill /> : <RiFullscreenFill />}
              </ToolButton>
            </div>
          </div>
        </div>
        <div className="relative min-h-80 flex-1 overflow-hidden" style={{ background: CONSOLE_BACKGROUND }} onClick={() => input.current?.focus({ preventScroll: true })}>
          <ConsoleTerminal ref={terminal} socket={socket} fontSize={fontSize} filter={filter} onScrolledUp={setScrolledUp} onEmptyChange={setFilteredEmpty} />
          {socket.loaded ? null : (
            <div role="status" className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <Spinner className="size-6 text-white/60" />
              <span className="sr-only">{t('console.loading')}</span>
            </div>
          )}
          {filteredEmpty ? <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-white/45">{t('console.filterEmpty')}</p> : null}
          {scrolledUp ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation()
                terminal.current?.scrollToBottom()
              }}
              className="absolute bottom-3 right-5 z-10 rounded-full shadow-lg"
            >
              <RiArrowDownFill />
              {t('console.toBottom')}
            </Button>
          ) : null}
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 p-2">
          <div className={cn('flex h-9 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.05] px-3 font-mono text-sm focus-within:bg-foreground/[0.08]', offline && 'opacity-50')}>
            <span className="text-accent">&gt;</span>
            <input
              ref={input}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  recall(1)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  recall(-1)
                } else if (e.key === 'Escape') {
                  setCommand('')
                  setCursor(-1)
                } else if (e.key === 'l' && e.ctrlKey) {
                  e.preventDefault()
                  terminal.current?.clear()
                }
              }}
              placeholder={!allowed ? t('console.noAccess') : offline ? t('console.offline') : t('console.placeholder')}
              disabled={offline}
              spellCheck={false}
              autoComplete="off"
              aria-label={t('console.placeholder')}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-sans placeholder:text-subtle-foreground"
            />
          </div>
          <Button type="submit" size="icon" variant="accent" disabled={offline || !command.trim()} aria-label={t('console.send')}>
            <RiSendPlaneFill />
          </Button>
        </form>
      </Card>
    </div>
  )
}
