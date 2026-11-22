import { RiCheckFill, RiTeamFill, RiDashboard3Fill, RiFileSettingsFill, RiFolder3Fill, RiLinkM, RiPlayFill, RiPriceTag3Fill, RiPuzzle2Fill, RiRestartFill, RiSettings3Fill, RiSkullFill, RiStopFill, RiTimerFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type GameTemplate, type GameVariable, type PowerAction, resolveTemplate, variableVisible } from '@hako/shared'
import { Button, EmptyState, Segmented, Skeleton, Tooltip, cn, toast } from '@hako/ui'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { Page } from '../components/app-shell'
import { StatusBadge, serverAddress } from '../components/server-bits'
import { ServerAddons } from '../components/server/addons'
import { ServerConfig } from '../components/server/config'
import { ServerConsole } from '../components/server/console'
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

type Tab = 'overview' | 'config' | 'files' | 'addons' | 'settings' | 'access'

const TAB_ICONS: Record<Tab, ReactNode> = {
  overview: <RiDashboard3Fill />,
  config: <RiFileSettingsFill />,
  files: <RiFolder3Fill />,
  addons: <RiPuzzle2Fill />,
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
        <div className="mb-6 flex items-center gap-5">
          <Skeleton className="size-16 rounded-[22%]" />
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="mb-4 h-10 w-full max-w-xl" />
        <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
        <Skeleton className="h-96" />
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
    ...(game.configs.length && (can(s, 'config') || can(s, 'files')) ? (['config'] as const) : []),
    ...(can(s, 'files') ? (['files'] as const) : []),
    ...(game.addons.length && can(s, 'addons') ? (['addons'] as const) : []),
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
      <header className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-4">
        <ServerAvatar game={game} values={s.variables} icon={s.icon} size={64} ring="var(--color-background)" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight">
            <span className="break-words">{s.name}</span>
            <StatusBadge status={s.status} />
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.9375rem] text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
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
              {copied ? <RiCheckFill className="text-success" /> : <RiLinkM />}
              <span className={cn('text-sm', copied ? 'text-success' : 'font-mono')} aria-live="polite">
                {copied ? t('server.copied') : address}
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
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(next) => setParams({ tab: next }, { replace: true })}
        options={tabs.map((value) => ({ value, label: t(`server.tabs.${value}`), icon: TAB_ICONS[value] }))}
      />
      {tab === 'overview' ? <ServerConsole server={s} socket={socket} playerList={game.console.players ? (game.id === 'minecraft' ? 'minecraft' : 'plain') : null} /> : null}
      {tab === 'config' ? <ServerConfig server={s} game={game} online={socket.players} /> : null}
      {tab === 'files' ? <ServerFiles server={s} /> : null}
      {tab === 'addons' ? <ServerAddons server={s} /> : null}
      {tab === 'settings' ? <ServerSettings key={s.id} server={s} game={game} /> : null}
      {tab === 'access' ? <ServerAccess server={s} /> : null}
      <UploadManager server={s} />
    </Page>
  )
}
