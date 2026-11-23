import {
  RiArrowDownFill,
  RiArrowUpDownFill,
  RiCpuFill,
  RiTerminalBoxFill,
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
import { type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
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
const SHUT_KEY = 'hako:console-collapsed'
const HEIGHT_KEY = 'hako:console-height'
const MIN_HEIGHT = 160
const FILTERS: LogFilter[] = ['all', 'error', 'warn', 'info']
const FONT_SIZES = [11, 12, 13, 14, 16, 18]

function rates(stats: ServerStats[], key: 'rx' | 'tx') {
  return stats.slice(1).map((cur, i) => {
    const prev = stats[i]!
    const seconds = (cur.at - prev.at) / 1000
    return seconds > 0 ? Math.max(0, (cur[key] - prev[key]) / seconds) : 0
  })
}

function Metrics({ server, stats, compact }: { server: Server; stats: ServerStats[]; compact: boolean }) {
  const { t } = useTranslation()
  const last = stats.at(-1)
  const live = server.status !== 'offline' && last
  const memoryLimit = last?.memoryLimit || server.memory * 1024 * 1024
  const share = (s: ServerStats) => (s.cpuLimit ? s.cpu / s.cpuLimit : s.cpu)
  const cpu = stats.map(share)
  const rx = rates(stats, 'rx')
  const tx = rates(stats, 'tx')
  const netMax = Math.max(1024, ...rx, ...tx) * 1.2
  const usage = useQuery({ queryKey: ['usage', server.id], queryFn: () => api.usage(server.id), refetchInterval: 30_000 })
  const idle = server.status === 'offline' ? t('console.noData') : t('console.waiting')
  const percent = (v: number) => `${v.toFixed(v < 10 ? 2 : 1)}%`
  const planned = server.memory * 1024 * 1024
  const memoryPending = Boolean(live && Math.abs(memoryLimit - planned) > 1024 * 1024)
  const memoryPoints = stats.map((s) => (s.memory / memoryLimit) * 100)
  const inColor = 'var(--color-accent)'
  const outColor = 'var(--color-muted-foreground)'
  const warming = server.status !== 'offline' && stats.length < 2
  return (
    <div className="@container">
    <div className={cn('grid grid-cols-1', compact ? 'gap-2 @md:grid-cols-2 @3xl:grid-cols-4' : 'gap-3 @lg:grid-cols-2 @5xl:grid-cols-4')}>
      <StatCard
        compact={compact}
        title={t('console.cpu')}
        icon={<RiCpuFill />}
        value={live ? (compact && server.cpu ? percent(last.cpu) : percent(share(last))) : '—'}
        total={live && compact && server.cpu ? `${server.cpu * 100}%` : undefined}
        detail={live ? (server.cpu ? t('console.cpuCores', { used: percent(last.cpu), limit: `${server.cpu * 100}%` }) : null) : idle}
        series={live ? [{ label: t('console.cpu'), color: 'var(--color-accent)', points: cpu }] : undefined}
        max={Math.max(100, ...cpu)}
        format={percent}
        length={SAMPLES}
        loading={warming}
      />
      <StatCard
        compact={compact}
        title={t('console.memory')}
        icon={<RiDatabase2Fill />}
        value={live ? (compact ? formatBytes(last.memory) : percent((last.memory / memoryLimit) * 100)) : '—'}
        total={live && compact ? formatBytes(memoryLimit) : undefined}
        detail={live ? `${formatBytes(last.memory)} / ${formatBytes(memoryLimit)}${memoryPending ? ` · ${t('console.memoryAfterRestart', { size: formatBytes(planned) })}` : ''}` : idle}
        series={live ? [{ label: t('console.memory'), color: 'var(--color-accent)', points: memoryPoints }] : undefined}
        max={100}
        format={percent}
        length={SAMPLES}
        loading={warming}
      />
      <StatCard
        compact={compact}
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
      <StatCard compact={compact} title={t('console.storage')} icon={<RiHardDrive3Fill />} value={usage.data ? formatBytes(usage.data.bytes) : '—'} detail={t('console.storageHint')} loading={usage.isPending} />
    </div>
    </div>
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

export function ServerConsole({ server, socket, compact, chat }: { server: Server; socket: ServerSocket; compact: boolean; chat?: ReactNode }) {
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
  const [shut, setShut] = useState(() => readStorage(SHUT_KEY) === 'true')
  const toggleShut = (next: boolean) => {
    setShut(next)
    writeStorage(SHUT_KEY, String(next))
  }
  const logBox = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(() => {
    const stored = Number(readStorage(HEIGHT_KEY))
    return Number.isFinite(stored) && stored >= MIN_HEIGHT ? stored : 0
  })
  const saveHeight = (next: number) => {
    setHeight(next)
    writeStorage(HEIGHT_KEY, String(next))
  }
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = logBox.current
    if (!box) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startHeight = box.getBoundingClientRect().height
    let next = startHeight
    const move = (ev: PointerEvent) => {
      next = Math.round(Math.max(MIN_HEIGHT, startHeight + ev.clientY - startY))
      setHeight(next)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      writeStorage(HEIGHT_KEY, String(next))
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }
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
    <div className={cn('flex flex-1 flex-col', compact ? 'gap-2' : 'gap-3')}>
      <Metrics server={server} stats={socket.stats} compact={compact} />
      <Card className={cn('flex flex-col overflow-hidden', !shut && !height && 'min-h-[52rem] flex-1', !shut && height && 'shrink-0', fullscreen && 'fixed inset-0 z-50 rounded-none')}>
        <button type="button" aria-expanded={!shut} onClick={() => toggleShut(!shut)} className={cn('flex w-full shrink-0 cursor-pointer items-center gap-2 px-4 pt-3 text-left text-sm text-muted-foreground [&_svg]:size-4', shut && 'pb-3')}>
          <RiTerminalBoxFill />
          <span className="font-medium text-foreground">{t('console.title')}</span>
          <RiArrowDownSLine className={cn('ml-auto transition-transform', shut && '-rotate-90')} />
        </button>
        <div className={cn('flex min-h-0 flex-1 flex-col', shut && 'hidden')}>
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-2.5 pb-2.5 pt-2 lg:grid lg:grid-cols-[1fr_minmax(16rem,26rem)_1fr]">
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
        <div ref={logBox} className={cn('relative min-h-32 overflow-hidden', height && !fullscreen ? 'shrink-0' : 'flex-1')} style={{ background: CONSOLE_BACKGROUND, height: height && !fullscreen ? height : undefined }} onClick={() => input.current?.focus({ preventScroll: true })}>
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
        <form onSubmit={submit} className="flex shrink-0 items-center gap-2 p-2">
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
        {fullscreen ? null : (
          <Tooltip content={t('console.resizeHint')}>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('console.resize')}
            onPointerDown={startResize}
            onDoubleClick={() => saveHeight(0)}
            className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
          >
            <span className="h-1 w-10 rounded-full bg-foreground/15 transition-colors group-hover:bg-foreground/30" />
          </div>
          </Tooltip>
        )}
        </div>
      </Card>
      {chat}
    </div>
  )
}
