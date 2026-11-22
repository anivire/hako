import { RiDeleteBinFill, RiErrorWarningFill, RiExternalLinkLine, RiFileCopyFill, RiGlobalLine, RiMap2Fill, RiMore2Fill, RiRefreshLine } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type GameTemplate, type MapProvider, type Server, variableVisible } from '@hako/shared'
import { Button, Card, Dialog, DialogClose, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, Spinner, Switch, Tooltip, cn, toast } from '@hako/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { can } from '../../lib/access'
import { useText } from '../../lib/i18n'
import { errorMessage, keys } from '../../lib/queries'
import { GameIcon } from '../game-icon'
import { withDefaults } from '../variables-form'

export function mapProviders(game: GameTemplate, server: Server): MapProvider[] {
  const values = withDefaults(game, server.variables)
  return (game.map?.providers ?? []).filter((p) => variableVisible(p, values))
}

function shareUrl(token: string) {
  return `${window.location.origin}/api/share/map/${token}/`
}

export function ServerMap({ server, game, send }: { server: Server; game: GameTemplate; send: (command: string) => void }) {
  const { t } = useTranslation()
  const text = useText()
  const client = useQueryClient()
  const providers = mapProviders(game, server)
  const active = providers.find((p) => p.id === server.variables.MAP)
  const manage = can(server, 'settings')
  const token = server.variables.MAP_SHARE || ''
  const [confirming, setConfirming] = useState(false)
  const onServer = (next: Server) => {
    client.setQueryData(keys.server(server.id), next)
    client.invalidateQueries({ queryKey: keys.servers, exact: true })
    client.invalidateQueries({ queryKey: keys.addons(server.id) })
  }
  const choose = useMutation({
    mutationFn: (provider: string | null) => api.setMap(server.id, provider),
    onSuccess: (next, provider) => {
      onServer(next)
      toast.success(provider ? t('map.installed') : t('map.removed'), { description: server.status === 'offline' ? undefined : t('map.restart') })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const probe = useQuery({
    queryKey: ['map-probe', server.id, server.startedAt, active?.id],
    queryFn: () => fetch(api.mapUrl(server.id), { method: 'GET', credentials: 'same-origin' }).then((r) => r.ok),
    enabled: Boolean(active) && server.status !== 'offline',
    refetchInterval: (q) => (q.state.data ? false : 5000),
  })
  const share = useMutation({ mutationFn: (on: boolean) => api.setMapShare(server.id, on), onSuccess: onServer, onError: (e) => toast.error(errorMessage(e, t)) })

  if (!active)
    return manage ? (
      <div className="flex flex-col gap-4">
        <p className="text-[0.8125rem] text-muted-foreground">{t('map.pick')}</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
          {providers.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <GameIcon src={p.icon} fallback={text(p.name)} className="size-10 rounded-lg" />
                <div className="min-w-0">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-accent">
                      {text(p.name)}
                      <RiExternalLinkLine className="size-3.5 text-subtle-foreground" />
                    </a>
                  ) : (
                    <div className="font-medium">{text(p.name)}</div>
                  )}
                  {p.description ? <div className="text-[0.8125rem] text-muted-foreground">{text(p.description)}</div> : null}
                </div>
              </div>
              <Button variant="accent" className="mt-auto" loading={choose.isPending && choose.variables === p.id} disabled={choose.isPending} onClick={() => choose.mutate(p.id)}>
                {t('map.enable')}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    ) : (
      <EmptyState icon={<RiMap2Fill className="size-10 text-subtle-foreground" />} title={t('map.none')} />
    )

  const copy = () => navigator.clipboard.writeText(shareUrl(token)).then(() => toast.success(t('map.copied')))
  const canRender = Boolean(active.render) && server.status === 'running' && can(server, 'console')
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Card className="flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3">
          <GameIcon src={active.icon} fallback={text(active.name)} className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{text(active.name)}</div>
            <div className="text-xs text-muted-foreground">{t('map.port', { port: server.ports.find((p) => p.name === 'map')?.host ?? active.port })}</div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {canRender ? (
              <Tooltip content={t('map.renderHint')}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('map.render')}
                  onClick={() => {
                    send(active.render!)
                    toast.success(t('map.rendering'))
                  }}
                >
                  <RiRefreshLine />
                </Button>
              </Tooltip>
            ) : null}
            <Tooltip content={t('map.open')}>
              <Button variant="ghost" size="icon-sm" aria-label={t('map.open')} onClick={() => window.open(token ? shareUrl(token) : api.mapUrl(server.id), '_blank', 'noopener')}>
                <RiExternalLinkLine />
              </Button>
            </Tooltip>
            {manage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('map.more')}>
                    <RiMore2Fill />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-danger" onSelect={() => setConfirming(true)}>
                    <RiDeleteBinFill />
                    {t('map.disable')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        {manage || token ? (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <div className="flex items-center gap-3 rounded-xl bg-foreground/[0.04] px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent [&_svg]:size-4">
                <RiGlobalLine />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t('map.public')}</div>
                <div className="text-[0.8125rem] text-muted-foreground">{t('map.publicHint')}</div>
              </div>
              {manage ? <Switch checked={Boolean(token)} disabled={share.isPending} onCheckedChange={(on) => share.mutate(on)} aria-label={t('map.public')} /> : null}
            </div>
            {token ? (
              <div className="flex items-center gap-1 rounded-lg bg-field py-1 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{shareUrl(token)}</span>
                <Button variant="ghost" size="sm" onClick={() => void copy()}>
                  <RiFileCopyFill />
                  {t('map.copy')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title={t('map.disableTitle', { name: text(active.name) })} description={t('map.disableHint')}>
          <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
            <DialogClose asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={choose.isPending}
              onClick={() => choose.mutate(null, { onSettled: () => setConfirming(false) })}
            >
              {t('map.disable')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {server.status === 'offline' ? (
        <EmptyState icon={<RiMap2Fill className="size-10 text-subtle-foreground" />} title={t('map.offline')} description={t('map.offlineHint')} />
      ) : !probe.data ? (
        <EmptyState
          icon={probe.isPending ? <Spinner className="size-8 text-subtle-foreground" /> : <RiErrorWarningFill className="size-10 text-warning" />}
          title={probe.isPending ? t('map.checking') : t('map.notReady')}
          description={probe.isPending ? undefined : t(server.status === 'starting' ? 'map.notReadyStarting' : 'map.notReadyHint', { name: text(active.name) })}
        />
      ) : (
        <div className={cn('relative min-h-[28rem] flex-1 overflow-hidden rounded-xl bg-inset')}>
          <iframe key={server.startedAt ?? ''} src={api.mapUrl(server.id)} title={text(active.name)} className="absolute inset-0 size-full border-0" />
        </div>
      )}
    </div>
  )
}
