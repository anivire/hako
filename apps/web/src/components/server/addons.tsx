import { RiArrowDownSLine, RiDeleteBinFill, RiLinkUnlinkM, RiDownloadFill, RiExternalLinkFill, RiPuzzle2Fill, RiRefreshFill, RiSearchFill, RiUploadCloud2Fill } from '@remixicon/react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AddonEntry, AddonProject, AddonSourceInfo, AddonUpdate, AddonsOverview, Server } from '@hako/shared'
import { Badge, Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, EmptyState, Input, Segmented, Skeleton, Spinner, Switch, Tooltip, cn, toast } from '@hako/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { formatBytes } from '../../lib/format'
import { errorMessage, keys } from '../../lib/queries'
import { useDebounced } from '../../lib/use-debounced'

function AddonIcon({ server, src, className }: { server: Server; src: string | null; className?: string }) {
  if (src) return <img src={src.startsWith('https://') ? api.addonIcon(server.id, src) : src} alt="" loading="lazy" className={cn('size-10 shrink-0 rounded-lg bg-field object-cover', className)} />
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg bg-field text-subtle-foreground [&_svg]:size-5', className)}>
      <RiPuzzle2Fill />
    </span>
  )
}

function InstalledRow({ server, entry, update, onChanged, locked }: { server: Server; entry: AddonEntry; update?: AddonUpdate; onChanged: () => void; locked: boolean }) {
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
          {entry.url ? (
            <a href={entry.url} target="_blank" rel="noreferrer" className="break-words text-sm font-medium hover:text-accent">
              {entry.name}
            </a>
          ) : (
            <span className="break-words text-sm font-medium">{entry.name}</span>
          )}
          {entry.version ? <span className="font-mono text-xs text-muted-foreground">{entry.version}</span> : null}
          {update ? (
            <Badge variant="accent" size="sm">
              {t('addons.updateTo', { version: update.version })}
            </Badge>
          ) : null}
          {!entry.source ? (
            <Badge variant="neutral" size="sm">
              {t('addons.manual')}
            </Badge>
          ) : null}
        </div>
        <div className="truncate font-mono text-xs text-subtle-foreground">
          {entry.fileName} · {formatBytes(entry.size)}
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
                if (confirm(t('addons.confirmDelete', { name: entry.name }))) remove.mutate()
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
  const updates = useQuery({
    queryKey: ['addon-updates', server.id],
    queryFn: () => api.addonUpdates(server.id),
    enabled: false,
    staleTime: 5 * 60_000,
  })
  const refresh = () => {
    client.invalidateQueries({ queryKey: keys.addons(server.id) })
    if (updates.data) void updates.refetch()
  }
  const updateAll = useMutation({
    mutationFn: () =>
      api.updateAddons(
        server.id,
        updates.data!.map((u) => u.path),
      ),
    onSuccess: ({ updated }) => {
      toast.success(t('addons.updatedMany', { count: updated }))
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const byPath = new Map((updates.data ?? []).map((u) => [u.path, u]))
  const needle = query.trim().toLowerCase()
  const shown = overview.entries.filter((e) => !needle || `${e.name} ${e.fileName}`.toLowerCase().includes(needle))
  const enabled = overview.entries.filter((e) => e.enabled).length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('addons.filter')} aria-label={t('addons.filter')} className="pl-9" />
        </div>
        {overview.sources[0]?.updates && !overview.modpack ? (
          <Button onClick={() => void updates.refetch()} loading={updates.isFetching}>
            <RiRefreshFill />
            {t('addons.checkUpdates')}
          </Button>
        ) : null}
        {updates.data?.length ? (
          <Button variant="accent" onClick={() => updateAll.mutate()} loading={updateAll.isPending}>
            <RiUploadCloud2Fill />
            {t('addons.updateAll', { count: updates.data.length })}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.8125rem] text-muted-foreground">
        <span>{t('addons.summary', { total: overview.entries.length, enabled })}</span>
        {overview.modpack ? null : <span>{updates.data && !updates.data.length ? t('addons.upToDate') : t('addons.restartHint')}</span>}
      </div>
      {!overview.entries.length ? (
        <EmptyState title={t('addons.noneInstalled')} description={overview.sources.length ? t('addons.noneInstalledHint') : t('addons.noneInstalledFiles')} />
      ) : !shown.length ? (
        <EmptyState title={t('addons.nothingFound')} />
      ) : (
        <Card className="flex flex-col p-1.5">
          {shown.map((entry) => (
            <InstalledRow key={entry.path} server={server} entry={entry} update={byPath.get(entry.path)} onChanged={refresh} locked={overview.modpack} />
          ))}
        </Card>
      )}
    </div>
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
  const search = useInfiniteQuery({
    queryKey: keys.addonSearch(server.id, source.id, q),
    queryFn: ({ pageParam }) => api.searchAddons(server.id, source.id, q, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.items.length, 0)
      return last.items.length && loaded < last.total ? loaded : undefined
    },
    staleTime: 300_000,
  })
  const items = [...new Map((search.data?.pages ?? []).flatMap((page) => page.items).map((p) => [p.id, p])).values()]
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
      <div className="relative">
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
          <Card className="flex flex-col p-1.5">
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
          {search.hasNextPage ? (
            <Button variant="secondary" className="self-center" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
              {t('addons.more')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}

function ModpackLock({ server }: { server: Server }) {
  const { t } = useTranslation()
  const client = useQueryClient()
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
    <Card className="flex flex-wrap items-center gap-3 bg-warning-soft px-4 py-3">
      <RiLinkUnlinkM className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t('addons.lockedTitle')}</div>
        <div className="text-[0.8125rem] text-muted-foreground">{t('addons.lockedHint')}</div>
      </div>
      <Button
        loading={unlink.isPending}
        onClick={() => {
          if (confirm(t('addons.unlinkConfirm'))) unlink.mutate()
        }}
      >
        {t('addons.unlink')}
      </Button>
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

export function ServerAddons({ server }: { server: Server }) {
  const { t } = useTranslation()
  const overview = useQuery({
    queryKey: keys.addons(server.id),
    queryFn: () => api.addons(server.id),
  })
  const [view, setView] = useState<'installed' | 'catalog'>('installed')
  if (overview.isPending) return <AddonsSkeleton />
  if (overview.error) return <EmptyState title={errorMessage(overview.error, t)} />
  const data = overview.data
  const source = data.sources[0]
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
          <span className="text-[0.8125rem] text-muted-foreground">
            {t('addons.context', {
              loader: data.loader,
              version: data.gameVersion ?? '?',
            })}
          </span>
        ) : null}
      </div>
      {data.modpack ? <ModpackLock server={server} /> : null}
      {view === 'installed' || !source || data.modpack ? <Installed server={server} overview={data} /> : <Catalog server={server} source={source} overview={data} />}
    </div>
  )
}
