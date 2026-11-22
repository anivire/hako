import { RiForbidFill, RiLogoutBoxRFill, RiSearchFill, RiShieldStarFill, RiUserFollowFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type PlayerList, type PlayerRecord, type PlayersSpec, type Server } from '@hako/shared'
import { Badge, Button, Card, EmptyState, Input, Segmented, Skeleton, StatusDot, Tooltip, cn, toast } from '@hako/ui'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/queries'

type Row = PlayerRecord & { online: boolean }

export function playerName(spec: PlayersSpec | undefined) {
  return new RegExp(spec?.name ?? '^[^\\s/\\\\]{1,32}$')
}

export function PlayerHead({ serverId, name, avatar, className }: { serverId: string; name: string; avatar?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!avatar || failed)
    return (
      <span aria-hidden className={cn('grid shrink-0 place-items-center bg-accent-soft font-semibold uppercase text-accent', className)}>
        <span className="text-[0.625em]">{name.slice(0, 1)}</span>
      </span>
    )
  return <img src={api.addonIcon(serverId, avatar.replaceAll('{{NAME}}', encodeURIComponent(name)))} alt="" loading="lazy" onError={() => setFailed(true)} className={cn('shrink-0 bg-field [image-rendering:pixelated]', className)} />
}

const FLAGS: { list: PlayerList; flag: 'op' | 'banned' | 'allowed'; icon: ReactNode; on: 'accent' | 'danger' | 'success' }[] = [
  { list: 'ops', flag: 'op', icon: <RiShieldStarFill />, on: 'accent' },
  { list: 'whitelist', flag: 'allowed', icon: <RiUserFollowFill />, on: 'success' },
  { list: 'bans', flag: 'banned', icon: <RiForbidFill />, on: 'danger' },
]

function rows(roster: PlayerRecord[], online: string[]): Row[] {
  const live = new Set(online.map((n) => n.toLowerCase()))
  const known = new Set(roster.map((p) => p.name.toLowerCase()))
  const extra = online.filter((n) => !known.has(n.toLowerCase())).map((name) => ({ name, uuid: null, op: false, banned: false, allowed: false }))
  return [...roster, ...extra].map((p) => ({ ...p, online: live.has(p.name.toLowerCase()) })).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
}

function PlayerRow({ server, spec, player, onDone }: { server: Server; spec: PlayersSpec; player: Row; onDone: (via?: 'console' | 'file') => void }) {
  const { t } = useTranslation()
  const toggle = useMutation({
    mutationFn: ({ list, on }: { list: PlayerList; on: boolean }) => (on ? api.addPlayer(server.id, list, player.name) : api.removePlayer(server.id, list, player.name)),
    onSuccess: ({ via }) => onDone(via),
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const kick = useMutation({ mutationFn: () => api.kickPlayer(server.id, player.name), onSuccess: () => onDone('console'), onError: (e) => toast.error(errorMessage(e, t)) })
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
      <PlayerHead serverId={server.id} name={player.name} avatar={spec.avatar} className="size-8 rounded-md text-base" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-medium">{player.name}</span>
        {player.online ? (
          <Badge size="sm" variant="success">
            <StatusDot tone="success" />
            {t('players.online')}
          </Badge>
        ) : null}
        {FLAGS.filter((f) => player[f.flag]).map((f) => (
          <Badge key={f.flag} size="sm" variant={f.on}>
            {t(`players.${f.flag}`)}
          </Badge>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {FLAGS.filter((f) => {
          const list = spec.lists[f.list]
          return list && (list.config || (server.status !== 'offline' && (player[f.flag] ? list.remove : list.add)))
        }).map((f) => {
          const on = player[f.flag]
          const label = t(on ? `players.un.${f.flag}` : `players.do.${f.flag}`)
          return (
            <Tooltip key={f.flag} content={label}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={label}
                aria-pressed={on}
                className={cn(on && { accent: 'text-accent', success: 'text-success', danger: 'text-danger' }[f.on])}
                loading={toggle.isPending && toggle.variables?.list === f.list}
                onClick={() => toggle.mutate({ list: f.list, on: !on })}
              >
                {f.icon}
              </Button>
            </Tooltip>
          )
        })}
        {player.online && spec.kick ? (
          <Tooltip content={t('players.kick')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('players.kick')} loading={kick.isPending} onClick={() => kick.mutate()}>
              <RiLogoutBoxRFill />
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}

export function PlayerManager({ server, spec, online }: { server: Server; spec: PlayersSpec; online: string[] }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const key = ['roster', server.id]
  const roster = useQuery({ queryKey: key, queryFn: () => api.roster(server.id) })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'online'>('all')
  const refresh = (via?: 'console' | 'file') => {
    if (via) toast.success(via === 'console' ? t('config.playersSent') : t('config.playersSaved'))
    client.invalidateQueries({ queryKey: key })
    client.invalidateQueries({ queryKey: ['players', server.id] })
    if (via === 'console') setTimeout(() => client.invalidateQueries({ queryKey: key }), 1500)
  }
  const needle = query.trim().toLowerCase()
  const all = rows(roster.data ?? [], online)
  const shown = all.filter((p) => (filter === 'all' || p.online) && p.name.toLowerCase().includes(needle))
  const typed = query.trim()
  const fresh = playerName(spec).test(typed) && !all.some((p) => p.name.toLowerCase() === needle) ? { name: typed, uuid: null, op: false, banned: false, allowed: false, online: false } : null
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.8125rem] text-muted-foreground">{t('players.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('players.search')} aria-label={t('players.search')} className="pl-9" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('players.all') },
            { value: 'online', label: `${t('players.online')} · ${online.length}` },
          ]}
        />
      </div>
      {roster.isPending ? (
        <Skeleton className="h-40" />
      ) : roster.error ? (
        <EmptyState title={errorMessage(roster.error, t)} />
      ) : shown.length || fresh ? (
        <Card className="flex flex-col p-1.5">
          {shown.map((p) => (
            <PlayerRow key={p.name} server={server} spec={spec} player={p} onDone={refresh} />
          ))}
          {fresh ? <PlayerRow key={`new:${fresh.name}`} server={server} spec={spec} player={fresh} onDone={refresh} /> : null}
        </Card>
      ) : (
        <EmptyState title={t(filter === 'online' ? 'console.nobodyOnline' : 'players.empty')} />
      )}
    </div>
  )
}
