import { RiArchiveStackFill, RiArrowRightSLine, RiCalendarScheduleFill, RiMap2Fill, RiCheckFill, RiContractUpDownFill, RiExpandUpDownFill, RiTeamFill, RiDashboard3Fill, RiFileSettingsFill, RiFolder3Fill, RiLinkM, RiPlayFill, RiPriceTag3Fill, RiPuzzle2Fill, RiRestartFill, RiSettings3Fill, RiSkullFill, RiStopFill, RiTimerFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type GameTemplate, type GameVariable, type PowerAction, resolveTemplate, variableVisible } from '@hako/shared'
import { Badge, Button, EmptyState, Popover, PopoverContent, PopoverTrigger, Segmented, Skeleton, Tooltip, cn, toast } from '@hako/ui'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { Page } from '../components/app-shell'
import { StatusBadge, serverAddress } from '../components/server-bits'
import { ServerAddons } from '../components/server/addons'
import { ServerBackups } from '../components/server/backups'
import { ServerSchedules } from '../components/server/schedules'
import { PLAYERS_TAB, ServerConfig } from '../components/server/config'
import { ServerConsole } from '../components/server/console'
import { ServerChat } from '../components/server/chat'
import { ServerMap, mapProviders } from '../components/server/map'
import { DockerWarning } from '../components/docker-warning'
import { useVariableValue, withDefaults } from '../components/variables-form'
import { ServerAvatar } from '../components/game-icon'
import { ServerFiles, UploadManager } from '../components/server/files'
import { ServerSettings } from '../components/server/settings'
import { api } from '../lib/api'
import { useText } from '../lib/i18n'
import { errorMessage, keys, useGames } from '../lib/queries'
import { useServerSocket } from '../lib/server-socket'
import { can } from '../lib/access'
import { ServerAccess } from '../components/server/access'
import { PlayerHead } from '../components/server/players'
import { readStorage, writeStorage } from '../lib/storage'

const COMPACT_KEY = 'hako:compact-metrics'

type Tab = 'overview' | 'map' | 'config' | 'files' | 'addons' | 'backups' | 'schedules' | 'settings' | 'access'

const TAB_ICONS: Record<Tab, ReactNode> = {
  overview: <RiDashboard3Fill />,
  map: <RiMap2Fill />,
  config: <RiFileSettingsFill />,
  files: <RiFolder3Fill />,
  addons: <RiPuzzle2Fill />,
  backups: <RiArchiveStackFill />,
  schedules: <RiCalendarScheduleFill />,
  settings: <RiSettings3Fill />,
  access: <RiTeamFill />,
}

export function ServerSummary({ game, values, version }: { game: GameTemplate; values: Record<string, string>; version?: string | null }) {
  const text = useText()
  const all = withDefaults(game, values)
  const visible = game.variables.filter((v) => variableVisible(v, all))
  const variantVariable = visible.find((v) => v.options?.some((o) => o.value === all[v.key] && o.icon))
  const variant = variantVariable?.options?.find((o) => o.value === all[variantVariable.key])
  const source = visible.find((v) => v.source && !v.source.search && all[v.key])
  const fixed = source ? undefined : visible.find((v) => v !== variantVariable && v.step === 'setup' && v.group === 'version' && v.type === 'select' && !v.source && v.options?.some((o) => o.value === all[v.key]))
  const fixedLabel = fixed ? text(fixed.options!.find((o) => o.value === all[fixed.key])!.label) || all[fixed.key] : ''
  return (
    <>
      {variant ? text(variant.label) || variant.value : text(game.name)}
      {source ? <SourceVersion game={game} variable={source} values={values} /> : version ? ` ${version}` : fixed ? ` ${(fixedLabel ?? '').split(' — ')[0]!.split(' · ')[0]}` : null}
    </>
  )
}

function SourceVersion({ game, variable, values }: { game: GameTemplate; variable: GameVariable; values: Record<string, string> }) {
  const { t } = useTranslation()
  const value = useVariableValue(game, variable, values)
  return <> {value === 'LATEST' ? t('variables.latest') : value}</>
}

function Uptime({ since }: { since: string }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const total = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  const parts = [
    [Math.floor(total / 86400), t('units.d')],
    [Math.floor((total % 86400) / 3600), t('units.h')],
    [Math.floor((total % 3600) / 60), t('units.m')],
    [total % 60, t('units.s')],
  ] as const
  const first = parts.findIndex(([n]) => n > 0)
  const shown = parts.slice(first < 0 ? 2 : Math.min(first, 2), (first < 0 ? 2 : Math.min(first, 2)) + 2)
  return <span className="tabular-nums">{shown.map(([n, unit]) => `${n}${unit}`).join(' ')}</span>
}

export function ServerPage() {
  const { id = '' } = useParams()
  return <ServerView key={id} id={id} />
}

function ServerView({ id }: { id: string }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const client = useQueryClient()
  const server = useQuery({ queryKey: keys.server(id), queryFn: () => api.server(id) })
  const [copied, setCopied] = useState(false)
  const [compact, setCompact] = useState(() => readStorage(COMPACT_KEY) === 'true')
  const games = useGames()
  const socket = useServerSocket(id)
  const power = useMutation({
    mutationFn: (action: PowerAction) => api.power(id, action),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.servers, exact: true }),
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  if (server.isPending || games.isPending)
    return (
      <Page>
        <div className={cn('flex flex-wrap items-center gap-y-4', compact ? 'mb-3 gap-x-3' : 'mb-6 gap-x-4')}>
          <Skeleton className={cn('rounded-[22%]', compact ? 'size-11' : 'size-[72px]')} />
          <div className={cn('flex min-w-0 flex-1 flex-col justify-between self-stretch', !compact && 'gap-1')}>
            <Skeleton className={cn('w-56 max-w-full', compact ? 'h-6' : 'h-8')} />
            <Skeleton className={cn('w-80 max-w-full', compact ? 'h-5' : 'h-6')} />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className={cn('w-96 max-w-full rounded-xl', compact ? 'mb-2 h-9' : 'mb-4 h-10')} />
        <div className={cn('flex flex-1 flex-col', compact ? 'gap-2' : 'gap-3')}>
          <div className="@container">
            <div className={cn('grid grid-cols-1', compact ? 'gap-2 @md:grid-cols-2 @3xl:grid-cols-4' : 'gap-3 @lg:grid-cols-2 @5xl:grid-cols-4')}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className={compact ? 'h-[3.25rem]' : 'min-h-[9.75rem]'} />
              ))}
            </div>
          </div>
          <Skeleton className="min-h-80 flex-1" />
        </div>
      </Page>
    )
  if (server.error || !server.data)
    return (
      <Page>
        <EmptyState title={errorMessage(server.error, t)} />
      </Page>
    )
  const s = server.data
  const base = games.data?.find((g) => g.id === s.game)
  const game = base && resolveTemplate(base, s.variables)
  if (!game)
    return (
      <Page>
        <EmptyState title={t('errors.gameUnknown')} />
      </Page>
    )
  const tabs: Tab[] = [
    'overview',
    ...(mapProviders(game, s).length && (s.variables.MAP || can(s, 'settings')) ? (['map'] as const) : []),
    ...(game.configs.length && (can(s, 'config') || can(s, 'files')) ? (['config'] as const) : []),
    ...(can(s, 'files') ? (['files'] as const) : []),
    ...(s.addons && can(s, 'addons') ? (['addons'] as const) : []),
    ...(can(s, 'files') ? (['backups'] as const) : []),
    ...(can(s, 'settings') ? (['schedules'] as const) : []),
    ...(can(s, 'settings') ? (['settings'] as const) : []),
    ...(can(s, 'manage') ? (['access'] as const) : []),
  ]
  const requested = params.get('tab') as Tab | null
  const tab = requested && tabs.includes(requested) ? requested : 'overview'
  const address = serverAddress(s)
  const offline = s.status === 'offline'
  return (
    <Page>
      <DockerWarning />
      <header className={cn('flex flex-wrap items-center gap-y-4', compact ? 'mb-3 gap-x-3' : 'mb-6 gap-x-4')}>
        <ServerAvatar game={game} values={s.variables} icon={s.icon} size={compact ? 44 : 72} ring="var(--color-background)" />
        <div className={cn('flex min-w-0 flex-1 flex-col justify-between self-stretch', !compact && 'gap-1')}>
          <h1 className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold tracking-tight', compact ? 'text-lg leading-6' : 'text-2xl')}>
            <span className="break-words">{s.name}</span>
            <StatusBadge status={s.status} />
          </h1>
          <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0', compact ? 'text-sm [&>*]:min-h-5' : 'text-[0.9375rem] [&>*]:min-h-6')}>
            <span className="flex items-center gap-1.5">
              <RiPriceTag3Fill />
              <ServerSummary game={game} values={s.variables} version={s.version} />
            </span>
            <span className="text-subtle-foreground">·</span>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 hover:text-foreground"
              onClick={() =>
                navigator.clipboard.writeText(address).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }
            >
              <span aria-live="polite" className="flex items-center gap-1.5">
                {copied ? (
                  <Badge variant="success">
                    <RiCheckFill />
                    {t('server.copied')}
                  </Badge>
                ) : (
                  <>
                    <RiLinkM />
                    <span className="font-mono text-sm">{address}</span>
                  </>
                )}
              </span>
            </button>
            {s.startedAt && !offline ? (
              <>
                <span className="text-subtle-foreground">·</span>
                <span className="flex items-center gap-1.5">
                  <RiTimerFill />
                  <Uptime since={s.startedAt} />
                </span>
              </>
            ) : null}
            {game.console.players && !offline ? (
              <>
                <span className="text-subtle-foreground">·</span>
                <OnlinePlayers serverId={s.id} players={socket.players} avatar={game.players?.avatar} link={Boolean(game.players && game.configs.length) && (can(s, 'config') || can(s, 'files'))} />
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!can(s, 'power') ? null : offline ? (
            <Button variant="accent" loading={power.isPending && power.variables === 'start'} onClick={() => power.mutate('start')}>
              <RiPlayFill />
              {t('server.start')}
            </Button>
          ) : (
            <>
              <Button variant="accent" loading={power.isPending && power.variables === 'restart'} onClick={() => power.mutate('restart')}>
                <RiRestartFill />
                {t('server.restart')}
              </Button>
              <Button disabled={s.status === 'stopping'} onClick={() => power.mutate('stop')}>
                <RiStopFill />
                {t('server.stop')}
              </Button>
              <Tooltip content={t('server.kill')}>
                <Button variant="danger" size="icon" aria-label={t('server.kill')} onClick={() => power.mutate('kill')}>
                  <RiSkullFill />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </header>
      <div className={cn('flex items-center gap-2', compact ? 'mb-2' : 'mb-4')}>
        <Segmented
          size={compact ? 'sm' : 'md'}
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          options={tabs.map((value) => ({ value, label: t(`server.tabs.${value === 'addons' ? s.addons! : value}`), icon: TAB_ICONS[value] }))}
        />
        <Tooltip content={compact ? t('console.fullView') : t('console.compactView')}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0"
            aria-label={compact ? t('console.fullView') : t('console.compactView')}
            aria-pressed={compact}
            onClick={() => {
              setCompact(!compact)
              writeStorage(COMPACT_KEY, String(!compact))
            }}
          >
            {compact ? <RiExpandUpDownFill /> : <RiContractUpDownFill />}
          </Button>
        </Tooltip>
      </div>
      {tab === 'overview' ? <ServerConsole server={s} socket={socket} compact={compact} chat={game.console.chat ? <ServerChat server={s} socket={socket} chat={game.console.chat} players={game.console.players} avatar={game.players?.avatar} compact={compact} /> : null} /> : null}
      {tab === 'map' ? <ServerMap server={s} game={game} send={socket.send} /> : null}
      {tab === 'config' ? <ServerConfig server={s} game={game} online={socket.players} /> : null}
      {tab === 'files' ? <ServerFiles server={s} /> : null}
      {tab === 'addons' ? <ServerAddons server={s} game={game} /> : null}
      {tab === 'backups' ? <ServerBackups server={s} /> : null}
      {tab === 'schedules' ? <ServerSchedules server={s} game={game} /> : null}
      {tab === 'settings' ? <ServerSettings key={s.id} server={s} game={game} /> : null}
      {tab === 'access' ? <ServerAccess server={s} /> : null}
      <UploadManager server={s} />
    </Page>
  )
}

function OnlinePlayers({ serverId, players, avatar, link }: { serverId: string; players: string[]; avatar?: string; link: boolean }) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
        <RiTeamFill />
        {players.length ? (
          <span className="flex">
            {players.slice(0, 3).map((name) => (
              <PlayerHead key={name} serverId={serverId} name={name} avatar={avatar} className="-ml-1 size-5 rounded-[5px] text-[1.1rem] outline-2 outline-background first:ml-0" />
            ))}
          </span>
        ) : null}
        <span>
          {t('console.online')} <span className="font-semibold tabular-nums text-foreground">{players.length}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {players.length ? (
          <ul className="max-h-72 overflow-y-auto">
            {players.map((name) => (
              <li key={name} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm">
                <PlayerHead serverId={serverId} name={name} avatar={avatar} className="size-6 rounded-md text-[1.3rem]" />
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t('console.nobodyOnline')}</p>
        )}
        {link ? (
          <Link to={{ search: `?tab=config&config=${encodeURIComponent(PLAYERS_TAB)}` }} className="mt-1 flex items-center justify-between rounded-md border-t border-border px-2 py-1.5 text-sm text-accent hover:bg-foreground/[0.05]">
            {t('console.managePlayers')}
            <RiArrowRightSLine className="size-4" />
          </Link>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
