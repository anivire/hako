import { RiAddFill, RiDownloadCloud2Fill, RiHardDrive3Fill, RiLayoutGridFill, RiLinkM, RiListUnordered, RiPulseFill, RiGroupFill, RiArrowDownLine, RiArrowUpLine, RiArrowUpDownLine, RiPieChart2Fill, RiSearchFill } from '@remixicon/react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { GameTemplate, QuickStats, Server } from '@hako/shared'
import { Button, Card, EmptyState, Input, Mascot, Segmented, Select, Skeleton, Tooltip, cn } from '@hako/ui'
import { Fragment, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { TLink } from '../components/transition-link'
import { Page, PageHeader } from '../components/app-shell'
import { GameIcon, ServerAvatar, variantOption } from '../components/game-icon'
import { StatusBadge, serverAddress } from '../components/server-bits'
import { api } from '../lib/api'
import { useText } from '../lib/i18n'
import { keys, useGames, useUser } from '../lib/queries'
import { readStorage, writeStorage } from '../lib/storage'
import { formatBytes } from '../lib/format'
import { ServerSummary } from './server'

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
const SORTS = ['running', 'offline'] as const
type Sort = (typeof SORTS)[number]
type View = 'grid' | 'list'
const VIEW_KEY = 'hako:servers-view'

function memoryLabel(memory: number) {
  return memory >= 1024 && memory % 1024 === 0 ? `${memory / 1024} GB` : `${memory} MB`
}

function UpdateMark({ server }: { server: Server }) {
  const { t } = useTranslation()
  if (!server.updates.image && !server.updates.addons) return null
  return (
    <Tooltip content={t('server.updatesAvailable')}>
      <RiDownloadCloud2Fill className="size-4 shrink-0 text-accent" aria-label={t('server.updatesAvailable')} />
    </Tooltip>
  )
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

function Meter({ label, value, share, loading }: { label: string; value: string; share: number | null; loading: boolean }) {
  if (loading) return <Skeleton className="h-4 rounded-md" />
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-foreground/[0.06]">
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

const OTHER_DISK = 'color-mix(in oklab, var(--color-foreground) 22%, transparent)'

function segmentColor(index: number) {
  return `oklch(from var(--color-accent) l max(c, 0.1) calc(h + ${index * 67}))`
}

type Segment = { id: string; amount: number; color: string; tip: ReactNode }

function SegmentTip({ color, title, rows }: { color: string; title: ReactNode; rows: [string, ReactNode][] }) {
  return (
    <div className="flex min-w-56 flex-col gap-2.5 p-1.5">
      <div className="flex items-center gap-2 font-medium">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{title}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-mono tabular-nums">{value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

function Gauge({ label, value, total, parts }: { label: string; value: string; total: number; parts: Segment[] }) {
  const shares = parts.map((part) => ({ ...part, share: total ? (part.amount / total) * 100 : 0 }))
  const at = Math.min(100, shares.reduce((sum, part) => sum + part.share, 0))
  return (
    <div className="flex min-w-0 flex-col gap-2.5 text-xs">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto font-mono text-lg font-semibold tabular-nums">{total ? `${at < 10 ? at.toFixed(1) : Math.round(at)}%` : '—'}</span>
        <span className="truncate font-mono text-muted-foreground tabular-nums" title={value}>
          {value}
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        {shares.map((part) => (
          <Tooltip key={part.id} content={part.tip}>
            <span className="h-full transition-[width,filter] duration-700 hover:brightness-125" style={{ width: `${part.share}%`, background: part.color }} />
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

function liveServers(servers: Server[], stats: Record<string, QuickStats> | undefined) {
  return servers
    .flatMap((s) => (s.status === 'running' && stats?.[s.id] ? [{ server: s, stats: stats[s.id]! }] : []))
    .sort((a, b) => b.stats.memory - a.stats.memory)
    .map((entry, i) => ({ ...entry, color: segmentColor(i) }))
}

function UsageChip({ icon, label, title, accent, children }: { icon: ReactNode; label: string; title?: string; accent?: boolean; children: ReactNode }) {
  const chip = (
    <span className={cn('inline-flex h-8 items-center gap-2 rounded-lg bg-field px-2.5 text-xs [&>svg]:size-4 [&>svg]:shrink-0', accent ? '[&>svg]:text-accent' : '[&>svg]:text-muted-foreground')}>
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono font-medium tabular-nums">{children}</span>
    </span>
  )
  return title ? <Tooltip content={title}>{chip}</Tooltip> : chip
}

function UsageCard({ servers, stats }: { servers: Server[]; stats: Record<string, QuickStats> | undefined }) {
  const { t } = useTranslation()
  const system = useQuery({ queryKey: ['system'], queryFn: api.system, staleTime: 30_000 })
  const running = servers.filter((s) => s.status === 'running')
  const live = liveServers(servers, stats)
  const memory = live.reduce((sum, e) => sum + e.stats.memory, 0)
  const cpu = live.reduce((sum, e) => sum + e.stats.cpu, 0)
  const hostMemory = (system.data?.memory ?? 0) * 1024 * 1024
  const hostCpu = (system.data?.cpus ?? 0) * 100
  const usage = useQueries({ queries: servers.map((s) => ({ queryKey: ['usage', s.id], queryFn: () => api.usage(s.id), staleTime: 60_000 })) })
  const disk = usage.reduce((sum, u) => sum + (u.data?.bytes ?? 0), 0)
  const hostDisk = system.data?.disk
  const loading = system.isPending || (running.length > 0 && !stats)
  const tracked = live.filter((e) => e.stats.players !== null)
  const players = tracked.reduce((sum, e) => sum + (e.stats.players ?? 0), 0)
  const rxRate = live.reduce((sum, e) => sum + e.stats.rxRate, 0)
  const txRate = live.reduce((sum, e) => sum + e.stats.txRate, 0)
  const allocated = servers.reduce((sum, s) => sum + s.memory, 0) * 1024 * 1024
  const updates = servers.filter((s) => s.updates.image || s.updates.addons).length
  const otherDisk = hostDisk ? Math.max(0, hostDisk.total - hostDisk.free - disk) : 0
  const serverTip = (e: (typeof live)[number]) => (
    <SegmentTip
      color={e.color}
      title={e.server.name}
      rows={[
        [t('servers.specMemory'), `${formatBytes(e.stats.memory, 2)} / ${formatBytes(e.stats.memoryLimit || e.server.memory * 1024 * 1024, 2)}`],
        [t('servers.specCpu'), e.server.cpu ? `${e.stats.cpu.toFixed(1)}% / ${e.server.cpu * 100}%` : `${e.stats.cpu.toFixed(1)}%`],
        ...(e.stats.players === null ? [] : [[t('servers.players'), String(e.stats.players)] as [string, ReactNode]]),
        [t('servers.network'), `↓${formatBytes(e.stats.rxRate, 1)}/s ↑${formatBytes(e.stats.txRate, 1)}/s`],
      ]}
    />
  )
  const diskTip = (color: string, title: string, amount: number) => <SegmentTip color={color} title={title} rows={[[t('servers.specDisk'), hostDisk ? `${formatBytes(amount, 2)} · ${((amount / hostDisk.total) * 100).toFixed(1)}%` : formatBytes(amount, 2)]]} />
  const diskValue = hostDisk ? t('servers.diskUsage', { used: formatBytes(disk, 1), total: formatBytes(hostDisk.total, 1), free: formatBytes(hostDisk.free, 1) }) : formatBytes(disk, 1)
  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight [&_svg]:size-4 [&_svg]:text-accent">
            <RiPulseFill />
            {t('servers.usage')}
          </span>
          <span className="text-xs text-muted-foreground">{t('servers.usageHint', { count: running.length, total: servers.length })}</span>
        </div>
        {loading ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {tracked.length ? (
              <UsageChip icon={<RiGroupFill />} label={t('servers.players')}>
                {players}
              </UsageChip>
            ) : null}
            {live.length ? (
              <UsageChip icon={<RiArrowUpDownLine />} label={t('servers.network')}>
                <span className="inline-flex items-center gap-0.5 [&_svg]:size-3.5">
                  <RiArrowDownLine className="text-success" />
                  {formatBytes(rxRate, 1)}/s
                </span>
                <span className="inline-flex items-center gap-0.5 [&_svg]:size-3.5">
                  <RiArrowUpLine className="text-info" />
                  {formatBytes(txRate, 1)}/s
                </span>
              </UsageChip>
            ) : null}
            <UsageChip icon={<RiPieChart2Fill />} label={t('servers.allocated')} title={t('servers.allocatedHint')}>
              {hostMemory ? `${formatBytes(allocated, 1)} / ${formatBytes(hostMemory, 1)}` : formatBytes(allocated, 1)}
            </UsageChip>
            {!live.length && hostDisk ? (
              <UsageChip icon={<RiHardDrive3Fill />} label={t('servers.specDisk')}>
                {diskValue}
              </UsageChip>
            ) : null}
            {updates ? (
              <UsageChip icon={<RiDownloadCloud2Fill />} label={t('servers.updates')} accent>
                {t('servers.updatesValue', { count: updates })}
              </UsageChip>
            ) : null}
          </div>
        )}
      </div>
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-3 sm:divide-x sm:divide-border sm:*:px-6 sm:*:first:pl-0 sm:*:last:pr-0">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : live.length ? (
        <div className="grid gap-5 sm:grid-cols-3 sm:divide-x sm:divide-border sm:*:px-6 sm:*:first:pl-0 sm:*:last:pr-0">
          <Gauge
            label={t('servers.specMemory')}
            total={hostMemory}
            value={hostMemory ? `${formatBytes(memory, 1)} / ${formatBytes(hostMemory, 1)}` : formatBytes(memory, 1)}
            parts={live.map((e) => ({ id: e.server.id, amount: e.stats.memory, color: e.color, tip: serverTip(e) }))}
          />
          <Gauge label={t('servers.specCpu')} total={hostCpu} value={hostCpu ? `${cpu.toFixed(1)}% / ${hostCpu}%` : `${cpu.toFixed(1)}%`} parts={live.map((e) => ({ id: e.server.id, amount: e.stats.cpu, color: e.color, tip: serverTip(e) }))} />
          <Gauge
            label={t('servers.specDisk')}
            total={hostDisk?.total ?? 0}
            value={diskValue}
            parts={[
              { id: 'servers', amount: disk, color: 'var(--color-accent)', tip: diskTip('var(--color-accent)', t('servers.diskServers'), disk) },
              { id: 'other', amount: otherDisk, color: OTHER_DISK, tip: diskTip(OTHER_DISK, t('servers.diskOther'), otherDisk) },
            ]}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 py-4">
          <Mascot mood="sleepy" size={56} className="shrink-0 opacity-80" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('servers.nothingRunning')}</span>
            <span className="text-xs text-muted-foreground">{t('servers.nothingRunningHint')}</span>
          </div>
        </div>
      )}
    </Card>
  )
}

function ServerCard({ server, game, stats, color }: { server: Server; game: GameTemplate | undefined; stats?: QuickStats; color?: string }) {
  const { t } = useTranslation()
  const disk = useDisk(server.id)
  const memoryLimit = stats?.memoryLimit || server.memory * 1024 * 1024
  const loading = server.status === 'running' && !stats
  const cores = server.cpu ? `${server.cpu * 100}%` : t('servers.coresUnlimited')
  return (
    <TLink to={`/servers/${server.id}`} className="group">
      <Card className="flex h-full min-h-40 flex-col gap-4 p-5 transition-colors [--avatar-ring:var(--color-surface)] group-hover:bg-muted group-hover:[--avatar-ring:var(--color-muted)]">
        <div className="flex items-start gap-4">
          <ServerAvatar game={game} values={server.variables} icon={server.icon} size={64} ring="var(--color-surface)" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 break-words text-[0.9375rem] font-semibold tracking-tight">
              {color ? <span className="size-2 shrink-0 rounded-full" style={{ background: color }} /> : null}
              {server.name}
              <UpdateMark server={server} />
            </div>
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
            loading={loading}
            value={stats ? `${formatBytes(stats.memory, 2)} / ${formatBytes(memoryLimit, 2)}` : memoryLabel(server.memory)}
          />
          <Meter label={t('servers.specCpu')} share={stats ? stats.cpu / 100 / stats.cpuLimit : null} loading={loading} value={stats ? (server.cpu ? `${stats.cpu.toFixed(2)}% / ${cores}` : `${(stats.cpu / stats.cpuLimit).toFixed(2)}%`) : cores} />
          <div className="flex items-center justify-between gap-3 pt-0.5 font-mono text-xs text-subtle-foreground">
            <span className="flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0">
              <RiHardDrive3Fill />
              <span className="truncate">{t('servers.onDisk', { size: disk })}</span>
            </span>
            <Tooltip content={serverAddress(server)}>
              <span className="flex shrink-0 items-center gap-1.5 [&_svg]:size-3.5">
                <RiLinkM />
                <span className="max-w-40 truncate">{server.address ?? (server.ports[0] ? `:${server.ports[0].host}` : '—')}</span>
              </span>
            </Tooltip>
          </div>
        </div>
      </Card>
    </TLink>
  )
}

function ServerRow({ server, game, color }: { server: Server; game: GameTemplate | undefined; color?: string }) {
  const text = useText()
  const { t } = useTranslation()
  const disk = useDisk(server.id)
  return (
    <TLink to={`/servers/${server.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors [--avatar-ring:var(--color-surface)] hover:bg-muted hover:[--avatar-ring:var(--color-muted)]">
      <ServerAvatar game={game} values={server.variables} icon={server.icon} size={36} ring="var(--color-surface)" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight">
          {color ? <span className="size-2 shrink-0 rounded-full" style={{ background: color }} /> : null}
          {server.name}
          <UpdateMark server={server} />
        </div>
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
      <Tooltip content={t('servers.specCpu')}>
        <span className="hidden w-12 shrink-0 text-right font-mono text-xs text-muted-foreground sm:block">{server.cpu ? String(server.cpu) : '∞'}</span>
      </Tooltip>
      <Tooltip content={t('console.storage')}>
        <span className="hidden w-20 shrink-0 text-right font-mono text-xs text-muted-foreground sm:block">{disk}</span>
      </Tooltip>
      <span className="flex w-32 shrink-0 justify-end">
        <StatusBadge status={server.status} />
      </span>
    </TLink>
  )
}

export function ServersPage() {
  const { t } = useTranslation()
  const text = useText()
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(() => (readStorage(VIEW_KEY) === 'list' ? 'list' : 'grid'))
  const changeView = (next: View) => {
    setView(next)
    writeStorage(VIEW_KEY, next)
  }
  const servers = useQuery({ queryKey: keys.servers, queryFn: api.servers, refetchInterval: 10_000 })
  const stats = useQuery({ queryKey: ['server-stats'], queryFn: api.serverStats, refetchInterval: 5000, enabled: Boolean(servers.data?.some((s) => s.status === 'running')) })
  const games = useGames()
  const users = useQuery({ queryKey: keys.users, queryFn: api.users, enabled: user.role === 'admin' })
  const query = params.get('q') ?? ''
  const gameFilter = params.get('game') ?? ''
  const sort = (SORTS as readonly string[]).includes(params.get('sort') ?? '') ? (params.get('sort') as Sort) : 'running'
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
  const colors = new Map(liveServers(servers.data ?? [], stats.data).map((e) => [e.server.id, e.color]))
  const gameOf = (id: string) => games.data?.find((g) => g.id === id)
  const list = servers.data ?? []
  const usedGames = [...new Set(list.map((s) => s.game))]
  const needle = query.trim().toLowerCase()
  const shown = list.filter((s) => {
    if (gameFilter && s.game !== gameFilter) return false
    if (!needle) return true
    const game = gameOf(s.game)
    const variant = game ? variantOption(game, s.variables) : undefined
    return [s.name, serverAddress(s), text(game?.name), variant ? text(variant.label) || variant.value : ''].join(' ').toLowerCase().includes(needle)
  })
  shown.sort((a, b) => Number((a.status === 'offline') === (sort === 'running')) - Number((b.status === 'offline') === (sort === 'running')))
  const owners = [...new Set(shown.map((s) => s.ownerId))].sort((a, b) => Number(b === user.id) - Number(a === user.id))
  const grouped = user.role === 'admin' && new Set(list.map((s) => s.ownerId)).size > 1
  const groups = grouped
    ? owners.map((id) => ({ id, title: id === user.id ? t('servers.mine') : (users.data?.find((u) => u.id === id)?.username ?? t('servers.unknownOwner')), servers: shown.filter((s) => s.ownerId === id) }))
    : [{ id: 0, title: null, servers: shown }]
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
          <UsageCard servers={list} stats={stats.data} />
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
            <Select value={sort} onValueChange={(value) => setParam('sort', value === 'running' ? '' : value)} options={SORTS.map((value) => ({ value, label: t(`servers.sort.${value}`) }))} className="w-full sm:w-56" />
            <Segmented
              value={view}
              onChange={changeView}
              options={[
                { value: 'grid', label: <RiLayoutGridFill className="size-4" aria-label={t('servers.viewGrid')} />, title: t('servers.viewGrid') },
                { value: 'list', label: <RiListUnordered className="size-4" aria-label={t('servers.viewList')} />, title: t('servers.viewList') },
              ]}
            />
          </div>
          {shown.length
            ? groups.map((group) => (
                <section key={group.id} className="flex flex-col gap-2">
                  {group.title ? (
                    <h2 className="flex items-center gap-2 pt-2 text-sm font-semibold tracking-tight">
                      {group.title}
                      <span className="font-normal text-subtle-foreground">{group.servers.length}</span>
                    </h2>
                  ) : null}
                  {view === 'list' ? (
                    <Card className="flex flex-col p-1.5">
                      {group.servers.map((s) => (
                        <ServerRow key={s.id} server={s} game={gameOf(s.game)} color={colors.get(s.id)} />
                      ))}
                    </Card>
                  ) : (
                    <div className={GRID}>
                      {group.servers.map((s) => (
                        <ServerCard key={s.id} server={s} game={gameOf(s.game)} stats={stats.data?.[s.id]} color={colors.get(s.id)} />
                      ))}
                    </div>
                  )}
                </section>
              ))
            : null}
          {shown.length ? null : (
            <EmptyState title={t('servers.nothingFound')} />
          )}
        </div>
      )}
    </Page>
  )
}
