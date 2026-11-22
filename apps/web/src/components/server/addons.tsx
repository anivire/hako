import { RiCheckFill, RiCheckboxCircleFill, RiCloseFill, RiErrorWarningFill, RiArrowUpCircleFill, RiExternalLinkLine, RiSortDesc, RiArrowDownSLine, RiArrowLeftSLine, RiArrowRightSLine, RiDeleteBinFill, RiLinkUnlinkM, RiDownloadFill, RiExternalLinkFill, RiPuzzle2Fill, RiRefreshFill, RiSearchFill, RiUploadCloud2Fill } from '@remixicon/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AddonEntry, AddonProject, AddonSourceInfo, AddonUpdate, AddonsOverview, GameTemplate, Server } from '@hako/shared'
import { Badge, Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, EmptyState, Input, Progress, Segmented, Select, Skeleton, Spinner, Switch, Tooltip, cn, toast } from '@hako/ui'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ask } from '../../lib/confirm'
import { ApiError, api } from '../../lib/api'
import { formatBytes } from '../../lib/format'
import { errorMessage, keys } from '../../lib/queries'
import { useDebounced } from '../../lib/use-debounced'
import { useText } from '../../lib/i18n'
import { readStorage, writeStorage } from '../../lib/storage'
import { GameIcon } from '../game-icon'

const SORTS = ['name', 'recent', 'size', 'updates'] as const
type Sort = (typeof SORTS)[number]
const SORT_KEY = 'hako:addons-sort'

function AddonIcon({ server, src, className }: { server: Server; src: string | null; className?: string }) {
  if (src) return <img src={src.startsWith('https://') ? api.addonIcon(server.id, src) : src} alt="" loading="lazy" className={cn('size-10 shrink-0 rounded-lg bg-field object-cover', className)} />
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg bg-field text-subtle-foreground [&_svg]:size-5', className)}>
      <RiPuzzle2Fill />
    </span>
  )
}

function InstalledRow({ server, entry, update, onChanged, locked, sourceName }: { server: Server; entry: AddonEntry; update?: AddonUpdate; onChanged: () => void; locked: boolean; sourceName?: string }) {
  const { t } = useTranslation()
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.toggleAddon(server.id, entry.path, enabled),
    onSuccess: onChanged,
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const remove = useMutation({
    mutationFn: () => api.removeAddon(server.id, entry.path),
    onSuccess: onChanged,
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const upgrade = useMutation({
    mutationFn: () => api.updateAddons(server.id, [entry.path]),
    onSuccess: () => {
      toast.success(t('addons.updatedOne', { name: entry.name }))
      onChanged()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  return (
    <div className={cn('flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted', !entry.enabled && 'opacity-60')}>
      <AddonIcon server={server} src={entry.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="break-words text-sm font-medium">{entry.name}</span>
          {entry.version ? <span className="font-mono text-xs text-muted-foreground">{entry.version}</span> : null}
          {update ? (
            <Badge variant="accent" size="sm">
              <RiArrowUpCircleFill />
              {t('addons.updateTo', { version: update.version })}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="neutral" size="sm" className="font-mono">
            {formatBytes(entry.size)}
          </Badge>
          {entry.url ? (
            <a href={entry.url} target="_blank" rel="noreferrer" className="inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:bg-accent-soft hover:text-accent [&_svg]:size-3">
              {sourceName ?? entry.source}
              <RiExternalLinkLine />
            </a>
          ) : !entry.source ? (
            <Badge variant="neutral" size="sm">
              {t('addons.manual')}
            </Badge>
          ) : null}
          <span className="min-w-0 truncate font-mono text-xs text-subtle-foreground">{entry.fileName}</span>
        </div>
      </div>
      {locked ? null : (
        <div className="flex shrink-0 items-center gap-1">
          {update ? (
            <Tooltip content={t('addons.update')}>
              <Button variant="ghost" size="icon-sm" aria-label={t('addons.update')} loading={upgrade.isPending} onClick={() => upgrade.mutate()}>
                <RiUploadCloud2Fill />
              </Button>
            </Tooltip>
          ) : null}
          <Switch checked={entry.enabled} disabled={toggle.isPending} onCheckedChange={(enabled) => toggle.mutate(enabled)} aria-label={t('addons.enabled')} />
          <Tooltip content={t('common.delete')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('common.delete')}
              loading={remove.isPending}
              onClick={() => {
                void ask({ title: t('addons.confirmDelete', { name: entry.name }), confirm: t('common.delete'), danger: true }).then((ok) => ok && remove.mutate())
              }}
            >
              <RiDeleteBinFill />
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

function Installed({ server, overview }: { server: Server; overview: AddonsOverview }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>(() => {
    const stored = readStorage(SORT_KEY) as Sort | null
    return stored && SORTS.includes(stored) ? stored : 'name'
  })
  const canUpdate = Boolean(overview.sources[0]?.updates) && !overview.modpack && overview.entries.some((e) => e.source)
  const updates = useQuery({
    queryKey: ['addon-updates', server.id],
    queryFn: () => api.addonUpdates(server.id),
    enabled: canUpdate,
    staleTime: 10 * 60_000,
  })
  const refresh = () => {
    client.invalidateQueries({ queryKey: keys.addons(server.id) })
    if (updates.data) void updates.refetch()
  }
  const [jobs, setJobs] = useState<UpdateJob[]>([])
  const running = jobs.some((j) => j.status === 'queued' || j.status === 'updating')
  const updateAll = async () => {
    const list: UpdateJob[] = (updates.data ?? []).map((u) => {
      const entry = overview.entries.find((e) => e.path === u.path)
      return { path: u.path, name: entry?.name ?? u.path, icon: entry?.icon ?? null, from: entry?.version ?? null, to: u.version, status: 'queued' }
    })
    setJobs(list)
    const patch = (path: string, next: Partial<UpdateJob>) => setJobs((prev) => prev.map((j) => (j.path === path ? { ...j, ...next } : j)))
    const queue = [...list]
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        patch(job.path, { status: 'updating' })
        try {
          await api.updateAddons(server.id, [job.path])
          patch(job.path, { status: 'done' })
        } catch (e) {
          patch(job.path, { status: 'error', error: errorMessage(e, t) })
        }
      }
    }
    await Promise.all([worker(), worker()])
    refresh()
  }
  const byPath = new Map((updates.data ?? []).map((u) => [u.path, u]))
  const needle = query.trim().toLowerCase()
  const order: Record<Sort, (a: AddonEntry, b: AddonEntry) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    recent: (a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''),
    size: (a, b) => b.size - a.size,
    updates: (a, b) => Number(byPath.has(b.path)) - Number(byPath.has(a.path)) || a.name.localeCompare(b.name),
  }
  const shown = overview.entries.filter((e) => !needle || `${e.name} ${e.fileName}`.toLowerCase().includes(needle)).sort(order[sort])
  const sourceName = overview.sources[0]?.name
  const enabled = overview.entries.filter((e) => e.enabled).length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('addons.filter')} aria-label={t('addons.filter')} className="pl-9" />
        </div>
        <Select
          value={sort}
          onValueChange={(next) => {
            setSort(next as Sort)
            writeStorage(SORT_KEY, next)
          }}
          options={SORTS.filter((s) => s !== 'updates' || canUpdate).map((value) => ({ value, label: t(`addons.sort.${value}`) }))}
          icon={<RiSortDesc />}
          className="w-full sm:w-56"
        />
        {canUpdate ? (
          <Tooltip content={t('addons.checkUpdates')}>
            <Button size="icon" aria-label={t('addons.checkUpdates')} onClick={() => void updates.refetch()} loading={updates.isFetching}>
              <RiRefreshFill />
            </Button>
          </Tooltip>
        ) : null}
        {updates.data?.length ? (
          <Button variant="accent" onClick={() => void updateAll()} loading={running}>
            <RiUploadCloud2Fill />
            {t('addons.updateAll', { count: updates.data.length })}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.8125rem] text-muted-foreground">
        <span>{t('addons.summary', { total: overview.entries.length, enabled })}</span>
        {overview.modpack ? null : (
          <span className="flex items-center gap-1.5">
            {updates.isFetching ? (
              <>
                <Spinner className="size-3.5" />
                {t('addons.checking')}
              </>
            ) : updates.data?.length ? (
              <span className="text-accent">{t('addons.updatesAvailable', { count: updates.data.length })}</span>
            ) : updates.data ? (
              <span className="text-success">{t('addons.upToDate')}</span>
            ) : (
              t('addons.restartHint')
            )}
          </span>
        )}
      </div>
      {jobs.length ? <UpdatePanel server={server} jobs={jobs} onClose={() => setJobs([])} /> : null}
      {!overview.entries.length ? (
        <EmptyState title={t('addons.noneInstalled')} description={overview.sources.length ? t('addons.noneInstalledHint') : t('addons.noneInstalledFiles')} />
      ) : !shown.length ? (
        <EmptyState title={t('addons.nothingFound')} />
      ) : (
        <Card className="flex flex-col p-1.5">
          {shown.map((entry) => (
            <InstalledRow key={entry.path} server={server} entry={entry} update={byPath.get(entry.path)} onChanged={refresh} locked={overview.modpack} sourceName={sourceName} />
          ))}
        </Card>
      )}
    </div>
  )
}

interface UpdateJob {
  path: string
  name: string
  icon: string | null
  from: string | null
  to: string
  status: 'queued' | 'updating' | 'done' | 'error'
  error?: string
}

function UpdatePanel({ server, jobs, onClose }: { server: Server; jobs: UpdateJob[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'error').length
  const failed = jobs.filter((j) => j.status === 'error').length
  const busy = finished < jobs.length
  return (
    <Card className="fixed bottom-4 right-4 z-40 w-[min(calc(100vw-2rem),24rem)] overflow-hidden shadow-xl">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        {busy ? <Spinner className="size-4 shrink-0 text-accent" /> : failed ? <RiErrorWarningFill className="size-5 shrink-0 text-danger" /> : <RiCheckboxCircleFill className="size-5 shrink-0 text-success" />}
        <button type="button" className="min-w-0 flex-1 cursor-pointer text-left text-sm font-medium" onClick={() => setCollapsed(!collapsed)}>
          {busy ? t('addons.updating') : failed ? t('addons.updateFailed', { count: failed }) : t('addons.updateDone')}
          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
            {finished} / {jobs.length}
          </span>
        </button>
        <Tooltip content={collapsed ? t('addons.expand') : t('addons.collapse')}>
          <Button size="icon-sm" variant="ghost" aria-label={collapsed ? t('addons.expand') : t('addons.collapse')} onClick={() => setCollapsed(!collapsed)}>
            <RiArrowDownSLine className={cn('transition-transform', collapsed && 'rotate-180')} />
          </Button>
        </Tooltip>
        {busy ? null : (
          <Tooltip content={t('common.close')}>
            <Button size="icon-sm" variant="ghost" aria-label={t('common.close')} onClick={onClose}>
              <RiCloseFill />
            </Button>
          </Tooltip>
        )}
      </div>
      <Progress value={jobs.length ? finished / jobs.length : 0} className="rounded-none" />
      {collapsed ? null : (
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {jobs.map((j) => (
            <li key={j.path} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <AddonIcon server={server} src={j.icon} className="size-7 rounded-md [&_svg]:size-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] font-medium">{j.name}</div>
                <div className={cn('truncate font-mono text-[0.6875rem]', j.status === 'error' ? 'text-danger' : 'text-muted-foreground')}>
                  {j.status === 'error' ? j.error : `${j.from ?? '?'} → ${j.to}`}
                </div>
              </div>
              {j.status === 'done' ? (
                <RiCheckFill className="size-4 shrink-0 text-success" />
              ) : j.status === 'error' ? (
                <RiErrorWarningFill className="size-4 shrink-0 text-danger" />
              ) : j.status === 'updating' ? (
                <Spinner className="size-4 shrink-0 text-accent" />
              ) : (
                <span className="size-1.5 shrink-0 rounded-full bg-subtle-foreground/50" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function VersionMenu({ server, source, project, onPick, disabled }: { server: Server; source: AddonSourceInfo; project: AddonProject; onPick: (versionId: string) => void; disabled?: boolean }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const versions = useQuery({
    queryKey: ['addon-versions', server.id, source.id, project.id],
    queryFn: () => api.addonVersions(server.id, source.id, project.id),
    enabled: open,
    staleTime: 5 * 60_000,
  })
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="secondary" aria-label={t('addons.pickVersion')} disabled={disabled} className="rounded-l-none">
          <RiArrowDownSLine />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuLabel>{t('addons.pickVersion')}</DropdownMenuLabel>
        {versions.isPending ? (
          <div className="grid place-items-center py-4">
            <Spinner />
          </div>
        ) : !versions.data?.length ? (
          <div className="px-3 py-2 text-[0.8125rem] text-muted-foreground">{t('addons.noVersions')}</div>
        ) : (
          versions.data.map((v) => (
            <DropdownMenuItem key={v.id} onSelect={() => onPick(v.id)} className="flex-col items-start gap-0">
              <span className="font-mono text-[0.8125rem] text-foreground">{v.version}</span>
              <span className="text-xs text-subtle-foreground">
                {v.loaders.join(', ')} · {date.format(new Date(v.publishedAt))}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Catalog({ server, source, overview }: { server: Server; source: AddonSourceInfo; overview: AddonsOverview }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const top = useRef<HTMLDivElement>(null)
  const [paging, setPaging] = useState({ q: '', offset: 0 })
  const offset = paging.q === q ? paging.offset : 0
  const search = useQuery({
    queryKey: [...keys.addonSearch(server.id, source.id, q), offset],
    queryFn: () => api.searchAddons(server.id, source.id, q, offset),
    placeholderData: keepPreviousData,
    staleTime: 300_000,
  })
  const items = search.data?.items ?? []
  const pageSize = search.data?.pageSize || 20
  const goTo = (page: number) => {
    setPaging({ q, offset: page * pageSize })
    top.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  const install = useMutation({
    mutationFn: (input: { projectId: string; versionId?: string }) => api.installAddon(server.id, source.id, input.projectId, input.versionId),
    onSuccess: ({ installed }) => {
      client.invalidateQueries({ queryKey: keys.addons(server.id) })
      toast.success(t('addons.installedToast', { names: installed.join(', ') }))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const have = new Set(overview.entries.map((e) => e.projectId).filter(Boolean))
  const compact = new Intl.NumberFormat(i18n.language, { notation: 'compact' })
  return (
    <div className="flex flex-col gap-3">
      <div ref={top} className="relative scroll-mt-4">
        <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('addons.search', { source: source.name })} className="pl-9" />
      </div>
      {search.isPending ? (
        <Card className="flex flex-col p-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 px-2.5 py-2.5">
              <Skeleton className="size-10" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/4" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </Card>
      ) : search.error ? (
        <EmptyState title={errorMessage(search.error, t)} />
      ) : !items.length ? (
        <EmptyState title={t('addons.nothingFound')} />
      ) : (
        <>
          <Card className={cn('flex flex-col p-1.5 transition-opacity', search.isPlaceholderData && 'opacity-60')}>
            {items.map((p) => {
              const busy = install.isPending && install.variables?.projectId === p.id
              return (
                <div key={p.id} className="flex items-start gap-3 rounded-lg px-2.5 py-2.5 hover:bg-muted">
                  <AddonIcon server={server} src={p.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-words text-sm font-medium hover:text-accent">
                        {p.name}
                        <RiExternalLinkFill className="size-3.5 text-subtle-foreground" />
                      </a>
                      <span className="text-xs text-subtle-foreground">{[p.author, t('addons.downloads', { count: compact.format(p.downloads) })].filter(Boolean).join(' · ')}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-muted-foreground">{p.description}</p>
                  </div>
                  {have.has(p.id) ? (
                    <Badge variant="success">{t('addons.installed')}</Badge>
                  ) : (
                    <div className="flex shrink-0">
                      <Button size="sm" className={cn(source.versions && 'rounded-r-none')} loading={busy} onClick={() => install.mutate({ projectId: p.id })}>
                        <RiDownloadFill />
                        {t('addons.install')}
                      </Button>
                      {source.versions ? <VersionMenu server={server} source={source} project={p} disabled={busy} onPick={(versionId) => install.mutate({ projectId: p.id, versionId })} /> : null}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
          <Pagination page={Math.floor(offset / pageSize)} pages={Math.ceil((search.data?.total ?? 0) / pageSize)} onChange={goTo} />
        </>
      )}
    </div>
  )
}

function pageList(page: number, pages: number): (number | null)[] {
  const wanted = [...new Set([0, page - 1, page, page + 1, pages - 1])].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b)
  return wanted.flatMap((p, i) => (i && p - wanted[i - 1]! > 1 ? [null, p] : [p]))
}

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { t } = useTranslation()
  if (pages <= 1) return null
  return (
    <nav aria-label={t('addons.pages')} className="flex flex-wrap items-center justify-center gap-1">
      <Button variant="ghost" size="icon-sm" aria-label={t('addons.previousPage')} disabled={page === 0} onClick={() => onChange(page - 1)}>
        <RiArrowLeftSLine />
      </Button>
      {pageList(page, pages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-subtle-foreground">…</span>
        ) : (
          <Button key={p} variant={p === page ? 'secondary' : 'ghost'} size="sm" className="min-w-8 px-2 tabular-nums" aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>
            {p + 1}
          </Button>
        ),
      )}
      <Button variant="ghost" size="icon-sm" aria-label={t('addons.nextPage')} disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
        <RiArrowRightSLine />
      </Button>
    </nav>
  )
}

function ModpackLock({ server }: { server: Server }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const status = useQuery({ queryKey: ['modpack-status', server.id], queryFn: () => api.modpackStatus(server.id), staleTime: 10 * 60_000 })
  const pack = status.data
  const outdated = Boolean(pack?.latest && pack.current && pack.latest !== pack.current)
  const unlink = useMutation({
    mutationFn: () => api.unlinkModpack(server.id),
    onSuccess: (next) => {
      client.setQueryData(keys.server(server.id), next)
      client.invalidateQueries({ queryKey: keys.servers, exact: true })
      client.invalidateQueries({ queryKey: keys.addons(server.id) })
      toast.success(t('addons.unlinked'))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  return (
    <Card className="flex flex-col gap-3 px-4 py-3">
      {pack?.name ? (
        <div className="flex flex-wrap items-center gap-3">
          <AddonIcon server={server} src={pack.icon} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {pack.url ? (
                <a href={pack.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:text-accent">
                  {pack.name}
                  <RiExternalLinkLine className="size-3.5 text-subtle-foreground" />
                </a>
              ) : (
                <span className="text-sm font-medium">{pack.name}</span>
              )}
              {pack.current ? (
                <Badge variant="neutral" size="sm" className="font-mono">
                  {pack.current}
                </Badge>
              ) : null}
              {status.isFetching ? <Spinner className="size-3.5" /> : outdated ? (
                <Badge variant="accent" size="sm">
                  <RiArrowUpCircleFill />
                  {t('addons.updateTo', { version: pack.latest })}
                </Badge>
              ) : pack.latest ? (
                <Badge variant="success" size="sm">
                  {t('addons.packLatest')}
                </Badge>
              ) : null}
            </div>
            <div className="text-[0.8125rem] text-muted-foreground">
              {outdated ? (pack.pinned ? t('addons.packPinned') : t('addons.packOnRestart')) : t('addons.packHint')}
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft px-3 py-2.5">
      <RiLinkUnlinkM className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t('addons.lockedTitle')}</div>
        <div className="text-[0.8125rem] text-muted-foreground">{t('addons.lockedHint')}</div>
      </div>
      <Button
        className="bg-warning text-[oklch(0.22_0.05_70)] hover:bg-warning/85"
        loading={unlink.isPending}
        onClick={() => {
          void ask({ title: t('addons.unlinkTitle'), description: t('addons.unlinkConfirm'), confirm: t('addons.unlink') }).then((ok) => ok && unlink.mutate())
        }}
      >
        {t('addons.unlink')}
      </Button>
      </div>
    </Card>
  )
}

function AddonsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-9" />
      <Card className="flex flex-col p-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2.5 py-2">
            <Skeleton className="size-10" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5" style={{ width: `${[30, 22, 36, 26, 40, 18][i]}%` }} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  )
}

export function ServerAddons({ server, game }: { server: Server; game: GameTemplate }) {
  const { t } = useTranslation()
  const text = useText()
  const overview = useQuery({
    queryKey: keys.addons(server.id),
    queryFn: () => api.addons(server.id),
  })
  const [view, setView] = useState<'installed' | 'catalog'>('installed')
  const [catalogId, setCatalogId] = useState('')
  if (overview.isPending) return <AddonsSkeleton />
  if (overview.error) return <EmptyState title={errorMessage(overview.error, t)} />
  const data = overview.data
  const source = data.sources[0]
  const catalog = data.sources.find((s) => s.id === catalogId && !s.missing) ?? source!
  const loaderIcon = data.loader ? game.variables.flatMap((v) => v.options ?? []).find((o) => o.icon && o.value.toLowerCase() === data.loader!.toLowerCase()) : undefined
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            {
              value: 'installed',
              label: t('addons.installedTitle'),
              count: data.entries.length,
            },
            {
              value: 'catalog',
              label: t('addons.browse'),
              disabled: !source || data.modpack,
              title: data.modpack ? t('addons.lockedTitle') : source ? undefined : t('addons.unsupported'),
            },
          ]}
        />
        {data.loader ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="neutral">
              {loaderIcon ? <GameIcon src={loaderIcon.icon} className="size-3.5 rounded-[3px]" /> : null}
              {loaderIcon ? text(loaderIcon.label) || data.loader : data.loader}
            </Badge>
            {data.gameVersion ? (
              <Badge variant="neutral" className="font-mono">
                {data.gameVersion}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      {data.modpack ? <ModpackLock server={server} /> : null}
      {view === 'installed' || !source || data.modpack ? (
        <Installed server={server} overview={data} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.sources.length > 1 ? <Segmented size="sm" value={catalog.id} onChange={(id) => setCatalogId(id)} options={data.sources.map((s) => ({ value: s.id, label: s.name, disabled: Boolean(s.missing), title: s.missing ? errorMessage(new ApiError(400, s.missing), t) : undefined }))} /> : null}
          <Catalog key={catalog.id} server={server} source={catalog} overview={data} />
        </div>
      )}
    </div>
  )
}
