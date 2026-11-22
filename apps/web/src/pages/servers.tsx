import { RiAddFill, RiHardDrive3Fill, RiLayoutGridFill, RiLinkM, RiListUnordered, RiSearchFill } from '@remixicon/react'
import { useQuery } from '@tanstack/react-query'
import type { GameTemplate, QuickStats, Server, ServerStatus } from '@hako/shared'
import { Button, Card, EmptyState, Input, Segmented, Select, Skeleton, cn } from '@hako/ui'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { TLink } from '../components/transition-link'
import { Page, PageHeader } from '../components/app-shell'
import { GameIcon, ServerAvatar, variantOption } from '../components/game-icon'
import { StatusBadge, serverAddress } from '../components/server-bits'
import { api } from '../lib/api'
import { useText } from '../lib/i18n'
import { keys, useGames } from '../lib/queries'
import { readStorage, writeStorage } from '../lib/storage'
import { formatBytes } from '../lib/format'
import { ServerSummary } from './server'

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
const STATUS_FILTERS = ['all', 'running', 'offline'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]
type View = 'grid' | 'list'
const VIEW_KEY = 'hako:servers-view'

function memoryLabel(memory: number) {
  return memory >= 1024 && memory % 1024 === 0 ? `${memory / 1024} GB` : `${memory} MB`
}

function useDisk(id: string) {
  const usage = useQuery({ queryKey: ['usage', id], queryFn: () => api.usage(id), staleTime: 60_000 })
  return usage.data ? formatBytes(usage.data.bytes) : '…'
}

function NewServerButton() {
  const { t } = useTranslation()
  return (
    <Button asChild variant="accent">
      <TLink to="/servers/new">
        <RiAddFill />
        {t('servers.new')}
      </TLink>
    </Button>
  )
}

function Chip({ icon, children, mono }: { icon?: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <span className={`inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0 ${mono ? 'font-mono' : ''}`}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

function Meter({ label, value, share }: { label: string; value: string; share: number | null }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        {share === null ? null : (
          <span
            className={cn('block h-full rounded-full transition-[width] duration-700', share > 0.9 ? 'bg-danger' : share > 0.7 ? 'bg-warning' : 'bg-accent')}
            style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }}
          />
        )}
      </span>
      <span className="text-right font-mono font-medium tabular-nums">{value}</span>
    </div>
  )
}

function ServerCard({ server, game, stats }: { server: Server; game: GameTemplate | undefined; stats?: QuickStats }) {
  const { t } = useTranslation()
  const disk = useDisk(server.id)
  const memoryLimit = stats?.memoryLimit || server.memory * 1024 * 1024
  const cores = server.cpu ? t('servers.cores', { count: server.cpu }) : t('servers.coresUnlimited')
  return (
    <TLink to={`/servers/${server.id}`} className="group">
      <Card className="flex h-full min-h-40 flex-col gap-4 p-5 transition-colors [--avatar-ring:var(--color-surface)] group-hover:bg-muted group-hover:[--avatar-ring:var(--color-muted)]">
        <div className="flex items-start gap-4">
          <ServerAvatar game={game} values={server.variables} icon={server.icon} size={64} ring="var(--color-surface)" />
          <div className="min-w-0 flex-1">
            <div className="break-words text-[0.9375rem] font-semibold tracking-tight">{server.name}</div>
            {game ? (
              <div className="truncate text-[0.8125rem] text-muted-foreground">
                <ServerSummary game={game} values={server.variables} version={server.version} />
              </div>
            ) : null}
          </div>
          <StatusBadge status={server.status} />
        </div>
        <div className="mt-auto flex flex-col gap-2.5">
          <Meter
            label={t('servers.specMemory')}
            share={stats ? stats.memory / memoryLimit : null}
            value={stats ? `${formatBytes(stats.memory)} / ${memoryLabel(server.memory)}` : memoryLabel(server.memory)}
          />
          <Meter label={t('servers.specCpu')} share={stats ? stats.cpu / 100 / stats.cpuLimit : null} value={stats ? (server.cpu ? `${Math.round(stats.cpu)}% / ${server.cpu * 100}%` : `${Math.round(stats.cpu / stats.cpuLimit)}%`) : cores} />
          <div className="flex items-center justify-between gap-3 pt-0.5 font-mono text-xs text-subtle-foreground">
            <span className="flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0">
              <RiHardDrive3Fill />
              <span className="truncate">{t('servers.onDisk', { size: disk })}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 [&_svg]:size-3.5" title={serverAddress(server)}>
              <RiLinkM />
              {server.ports[0] ? `:${server.ports[0].host}` : '—'}
            </span>
          </div>
        </div>
      </Card>
    </TLink>
  )
}

function ServerRow({ server, game }: { server: Server; game: GameTemplate | undefined }) {
  const text = useText()
  const { t } = useTranslation()
  const disk = useDisk(server.id)
  return (
    <TLink to={`/servers/${server.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors [--avatar-ring:var(--color-surface)] hover:bg-muted hover:[--avatar-ring:var(--color-muted)]">
      <ServerAvatar game={game} values={server.variables} icon={server.icon} size={36} ring="var(--color-surface)" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tracking-tight">{server.name}</div>
        {game ? (
          <div className="truncate text-[0.8125rem] text-muted-foreground">
            <ServerSummary game={game} values={server.variables} version={server.version} />
          </div>
        ) : null}
      </div>
      <span className="hidden w-48 shrink-0 lg:block">
        <Chip icon={<GameIcon src={game?.icon} fallback={text(game?.name) || server.game} className="size-3.5 rounded-[3px]" />}>{text(game?.name) || server.game}</Chip>
      </span>
      <span className="hidden w-44 shrink-0 truncate font-mono text-xs text-muted-foreground md:block">{serverAddress(server)}</span>
      <span className="hidden w-16 shrink-0 text-right font-mono text-xs text-muted-foreground sm:block">{memoryLabel(server.memory)}</span>
      <span className="hidden w-12 shrink-0 text-right font-mono text-xs text-muted-foreground sm:block" title={t('servers.specCpu')}>
        {server.cpu ? String(server.cpu) : '∞'}
      </span>
      <span className="hidden w-20 shrink-0 text-right font-mono text-xs text-muted-foreground sm:block" title={t('console.storage')}>
        {disk}
      </span>
      <span className="flex w-32 shrink-0 justify-end">
        <StatusBadge status={server.status} />
      </span>
    </TLink>
  )
}

function matchesStatus(status: ServerStatus, filter: StatusFilter) {
  if (filter === 'all') return true
  return filter === 'offline' ? status === 'offline' : status !== 'offline'
}

export function ServersPage() {
  const { t } = useTranslation()
  const text = useText()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(() => (readStorage(VIEW_KEY) === 'list' ? 'list' : 'grid'))
  const changeView = (next: View) => {
    setView(next)
    writeStorage(VIEW_KEY, next)
  }
  const servers = useQuery({ queryKey: keys.servers, queryFn: api.servers, refetchInterval: 10_000 })
  const stats = useQuery({ queryKey: ['server-stats'], queryFn: api.serverStats, refetchInterval: 5000, enabled: Boolean(servers.data?.some((s) => s.status === 'running')) })
  const games = useGames()
  const query = params.get('q') ?? ''
  const gameFilter = params.get('game') ?? ''
  const status = (STATUS_FILTERS as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as StatusFilter) : 'all'
  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value && value !== 'all') next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  const gameOf = (id: string) => games.data?.find((g) => g.id === id)
  const list = servers.data ?? []
  const usedGames = [...new Set(list.map((s) => s.game))]
  const needle = query.trim().toLowerCase()
  const shown = list.filter((s) => {
    if (gameFilter && s.game !== gameFilter) return false
    if (!matchesStatus(s.status, status)) return false
    if (!needle) return true
    const game = gameOf(s.game)
    const variant = game ? variantOption(game, s.variables) : undefined
    return [s.name, serverAddress(s), text(game?.name), variant ? text(variant.label) || variant.value : ''].join(' ').toLowerCase().includes(needle)
  })
  return (
    <Page>
      <PageHeader title={t('servers.title')} actions={list.length ? <NewServerButton /> : null} />
      {servers.isPending ? (
        <div className={GRID}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !list.length ? (
        <EmptyState title={t('servers.empty')} description={t('servers.emptyHint')} action={<NewServerButton />} />
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input value={query} onChange={(e) => setParam('q', e.target.value)} placeholder={t('servers.search')} aria-label={t('servers.search')} className="pl-9" />
            </div>
            {usedGames.length > 1 ? (
              <Select
                value={gameFilter}
                onValueChange={(value) => setParam('game', value)}
                options={[{ value: '', label: t('servers.allGames') }, ...usedGames.map((id) => ({ value: id, label: text(gameOf(id)?.name) || id }))]}
                className="w-full sm:w-56"
              />
            ) : null}
            <Segmented value={status} onChange={(value) => setParam('status', value)} options={STATUS_FILTERS.map((value) => ({ value, label: t(`servers.filters.${value}`) }))} />
            <Segmented
              value={view}
              onChange={changeView}
              options={[
                { value: 'grid', label: <RiLayoutGridFill className="size-4" aria-label={t('servers.viewGrid')} />, title: t('servers.viewGrid') },
                { value: 'list', label: <RiListUnordered className="size-4" aria-label={t('servers.viewList')} />, title: t('servers.viewList') },
              ]}
            />
          </div>
          {!shown.length ? null : view === 'list' ? (
            <Card className="flex flex-col p-1.5">
              {shown.map((s) => (
                <ServerRow key={s.id} server={s} game={gameOf(s.game)} />
              ))}
            </Card>
          ) : (
            <div className={GRID}>
              {shown.map((s) => (
                <ServerCard key={s.id} server={s} game={gameOf(s.game)} stats={stats.data?.[s.id]} />
              ))}
            </div>
          )}
          {shown.length ? null : (
            <EmptyState title={t('servers.nothingFound')} />
          )}
        </div>
      )}
    </Page>
  )
}
