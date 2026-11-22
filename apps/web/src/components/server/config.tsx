import { RiAddFill, RiArrowDownSLine, RiArrowGoBackFill, RiDeleteBinFill, RiExternalLinkFill, RiInformationFill, RiSearchFill, RiUserFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type BepinexEntry, type ConfigField, type ConfigFile, type GameTemplate, type Server, parseBepinex, parseIdList, parseJsonConfig, parseJsonList, parseProperties, updateBepinex, updateJsonConfig, updateProperties, writeIdList, writeJsonList } from '@hako/shared'
import { Button, Card, EmptyState, Input, SaveBar as UiSaveBar, Segmented, Select, Skeleton, Switch, Tooltip, cn, toast } from '@hako/ui'
import { type FormEvent, type ReactNode, useState } from 'react'
import { type TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { GroupIcon } from '../../lib/group-icons'
import { ApiError, api } from '../../lib/api'
import { useText } from '../../lib/i18n'
import { errorMessage, keys } from '../../lib/queries'
import { useUnsavedGuard } from '../../lib/unsaved'
import { MotdEditor } from './motd-editor'
import { PlayerHead, PlayerManager } from './players'

type MotdContext = { name: string; players: string; icon?: string }

type Field = Pick<ConfigField, 'key' | 'type'> & Partial<ConfigField> & { sub?: string }

function guessType(value: string): ConfigField['type'] {
  if (value === 'true' || value === 'false') return 'boolean'
  return /^-?\d+$/.test(value) ? 'number' : 'string'
}

function Control({ field, value, onChange, context }: { field: Field; value: string; onChange: (value: string) => void; context: MotdContext }) {
  const text = useText()
  const id = `cfg-${field.key}`
  if (field.type === 'motd') return <MotdEditor id={id} value={value} onChange={onChange} name={context.name} players={context.players} icon={context.icon} />
  if (field.type === 'boolean') return <Switch id={id} checked={value === 'true'} onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')} />
  if (field.type === 'select') {
    const options = (field.options ?? []).map((o) => ({ value: o.value, label: text(o.label) || o.value }))
    if (!options.some((o) => o.value === value)) options.unshift({ value, label: value })
    return <Select value={value} onValueChange={onChange} options={options} className="w-full sm:w-56" />
  }
  if (field.type === 'number') return <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-right font-mono sm:w-36" />
  return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full sm:w-72" />
}

function Row({ field, value, changed, onChange, onReset, context }: { field: Field; value: string; changed: boolean; onChange: (value: string) => void; onReset: () => void; context: MotdContext }) {
  const wide = field.type === 'motd'
  const { t } = useTranslation()
  const text = useText()
  const name = field.name ? text(field.name) : field.key
  return (
    <div className={cn('flex flex-col gap-3 rounded-lg px-3.5 py-3 transition-colors', !wide && 'sm:flex-row sm:items-center sm:justify-between sm:gap-6', changed && 'bg-accent-soft')}>
      <label htmlFor={`cfg-${field.key}`} className="min-w-0 flex-1 cursor-pointer">
        <span className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', !field.name && 'font-mono text-[0.8125rem]')}>{name}</span>
          {changed ? <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label={t('config.changed')} /> : null}
        </span>
        {field.description ? <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{text(field.description)}</span> : null}
        {field.name ? <span className="mt-0.5 block font-mono text-xs text-subtle-foreground">{field.sub ?? field.key}</span> : null}
      </label>
      <div className={cn('flex items-center gap-1.5', wide ? 'flex-row-reverse items-start' : 'shrink-0')}>
        {changed ? (
          <Tooltip content={t('config.reset')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('config.reset')} onClick={onReset}>
              <RiArrowGoBackFill />
            </Button>
          </Tooltip>
        ) : null}
        <Control field={field} value={value} onChange={onChange} context={context} />
      </div>
    </div>
  )
}

function Section({ icon, title, description, children, action }: { icon?: string; title: ReactNode; description?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col p-1.5">
      <div className="flex items-center justify-between gap-3 px-2.5 pb-2 pt-2.5">
        <div className="flex items-center gap-3">
          {icon ? <GroupIcon id={icon} /> : null}
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h3>
            {description ? <p className="text-[0.8125rem] text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

function SaveBar({ count, saving, onCancel, onSave }: { count: number; saving: boolean; onCancel: () => void; onSave: () => void }) {
  const { t } = useTranslation()
  const guard = useUnsavedGuard(count > 0)
  return (
    <>
      {guard}
      {count ? <UiSaveBar message={t('config.unsaved', { count })} cancelLabel={t('common.cancel')} saveLabel={t('common.save')} saving={saving} onCancel={onCancel} onSave={onSave} /> : null}
    </>
  )
}

function useSavedToast(server: Server) {
  const { t } = useTranslation()
  return () => toast.success(server.status === 'offline' ? t('config.saved') : t('config.savedRestart'))
}

const NUMERIC = /^(U?Int(16|32|64)|S?Byte|Single|Double|Decimal)$/

function bepinexField(entry: BepinexEntry, index: number, t: TFunction): Field {
  const select = entry.options && !entry.flags
  const sub = [
    entry.default !== null ? t('config.default', { value: entry.default || '""' }) : null,
    entry.min !== null && entry.max !== null ? t('config.range', { min: entry.min, max: entry.max }) : null,
    entry.flags && entry.options ? t('config.flags', { options: entry.options.join(', ') }) : null,
  ]
  return {
    key: `bx-${index}`,
    name: entry.key,
    description: entry.description || undefined,
    type: entry.type === 'Boolean' ? 'boolean' : select ? 'select' : NUMERIC.test(entry.type) ? 'number' : 'string',
    options: select ? entry.options!.map((value) => ({ value })) : undefined,
    sub: sub.filter(Boolean).join(' · ') || entry.type,
  }
}

function BepinexForm({ server, path, context }: { server: Server; path: string; context: MotdContext }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const saved = useSavedToast(server)
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const file = useQuery({ queryKey: keys.file(server.id, path), queryFn: () => api.readFile(server.id, path) })
  const save = useMutation({
    mutationFn: () => api.writeFile(server.id, path, updateBepinex(file.data!.content, changes)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.file(server.id, path) })
      setChanges({})
      saved()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  if (file.isPending) return <ConfigSkeleton config={{ path, format: 'bepinex', name: '', groups: [], fields: [] }} />
  if (file.error) return <EmptyState title={errorMessage(file.error, t)} />
  const parsed = parseBepinex(file.data.content)
  const needle = query.trim().toLowerCase()
  let index = 0
  const sections = parsed.sections
    .map((section) => ({
      name: section.name,
      entries: section.entries.map((entry) => ({ entry, field: bepinexField(entry, index++, t) })).filter(({ entry }) => !needle || `${entry.key} ${entry.description}`.toLowerCase().includes(needle)),
    }))
    .filter((section) => section.entries.length)
  const set = (entry: BepinexEntry, value: string) =>
    setChanges((c) => {
      const next = { ...c }
      if (value === entry.value) delete next[entry.id]
      else next[entry.id] = value
      return next
    })
  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('config.search')} aria-label={t('config.search')} className="pl-9" />
      </div>
      {sections.map((section) => (
        <Section key={section.name} title={section.name}>
          {section.entries.map(({ entry, field }) => (
            <Row key={entry.id} field={field} value={changes[entry.id] ?? entry.value} changed={entry.id in changes} onChange={(v) => set(entry, v)} onReset={() => set(entry, entry.value)} context={context} />
          ))}
        </Section>
      ))}
      {!sections.length ? <EmptyState title={t('config.nothingFound')} /> : null}
      <SaveBar count={Object.keys(changes).length} saving={save.isPending} onCancel={() => setChanges({})} onSave={() => save.mutate()} />
    </div>
  )
}

function BepinexEditor({ server, config, context }: { server: Server; config: ConfigFile; context: MotdContext }) {
  const { t } = useTranslation()
  const files = useQuery({ queryKey: keys.files(server.id, config.path), queryFn: () => api.files(server.id, config.path).catch(() => []) })
  const [picked, setPicked] = useState<string | null>(null)
  if (files.isPending) return <ConfigSkeleton config={config} />
  const cfgs = (files.data ?? [])
    .filter((f) => !f.dir && /\.cfg$/i.test(f.name))
    .sort((a, b) => Number(a.name === 'BepInEx.cfg') - Number(b.name === 'BepInEx.cfg') || a.name.localeCompare(b.name))
  if (!cfgs.length) return <EmptyState title={t('config.bepinexEmpty')} description={t('config.bepinexEmptyHint')} />
  const current = cfgs.find((f) => f.name === picked) ?? cfgs[0]!
  return (
    <div className="flex flex-col gap-4">
      <Select value={current.name} onValueChange={setPicked} options={cfgs.map((f) => ({ value: f.name, label: f.name.replace(/\.cfg$/i, '') }))} className="w-full sm:w-96" />
      <BepinexForm key={current.name} server={server} path={`${config.path}/${current.name}`} context={context} />
    </div>
  )
}

const LIST_ID = /^[\w.:-]{3,64}$/

function ListEditor({ server, config }: { server: Server; config: ConfigFile }) {
  const json = config.path.endsWith('.json')
  const { t } = useTranslation()
  const text = useText()
  const client = useQueryClient()
  const saved = useSavedToast(server)
  const [draft, setDraft] = useState('')
  const file = useQuery({
    queryKey: keys.file(server.id, config.path),
    queryFn: async () => {
      try {
        return await api.readFile(server.id, config.path)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { content: '' }
        throw e
      }
    },
    retry: false,
  })
  const save = useMutation({
    mutationFn: (ids: string[]) => api.writeFile(server.id, config.path, (json ? writeJsonList : writeIdList)(file.data!.content, ids)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.file(server.id, config.path) })
      saved()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  if (file.isPending) return <Skeleton className="h-40" />
  if (file.error) return <EmptyState title={errorMessage(file.error, t)} />
  const ids = (json ? parseJsonList : parseIdList)(file.data.content)
  const value = draft.trim()
  const valid = LIST_ID.test(value) && !ids.includes(value)
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (valid) save.mutate([...ids, value], { onSuccess: () => setDraft('') })
  }
  return (
    <div className="flex flex-col gap-4">
      {config.description ? <p className="text-[0.8125rem] text-muted-foreground">{text(config.description)}</p> : null}
      <form onSubmit={add} className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={config.placeholder ? text(config.placeholder) : t('config.listPlaceholder')} aria-label={config.placeholder ? text(config.placeholder) : t('config.listPlaceholder')} className="font-mono" />
        <Button type="submit" variant="accent" disabled={!valid} loading={save.isPending && save.variables?.length === ids.length + 1}>
          <RiAddFill />
          {t('config.listAdd')}
        </Button>
      </form>
      {ids.length ? (
        <Card className="flex flex-col p-1.5">
          {ids.map((id) => (
            <div key={id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
              <RiUserFill className="size-4 shrink-0 text-subtle-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{id}</span>
              {/^(Steam_)?\d{17}$/.test(id) ? (
                <Tooltip content={t('config.steamProfile')}>
                  <Button asChild variant="ghost" size="icon-sm">
                    <a href={`https://steamcommunity.com/profiles/${id.replace(/^Steam_/, '')}`} target="_blank" rel="noreferrer" aria-label={t('config.steamProfile')}>
                      <RiExternalLinkFill />
                    </a>
                  </Button>
                </Tooltip>
              ) : null}
              <Tooltip content={t('common.delete')}>
                <Button variant="ghost" size="icon-sm" aria-label={t('common.delete')} onClick={() => save.mutate(ids.filter((x) => x !== id))}>
                  <RiDeleteBinFill />
                </Button>
              </Tooltip>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState title={t('config.listEmpty')} />
      )}
    </div>
  )
}

export const PLAYERS_TAB = ':players'

const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/

function PlayersEditor({ server, config, avatar }: { server: Server; config: ConfigFile; avatar?: string }) {
  const { t } = useTranslation()
  const text = useText()
  const client = useQueryClient()
  const kind = config.list ?? 'whitelist'
  const [draft, setDraft] = useState('')
  const key = ['players', server.id, kind] as const
  const players = useQuery({ queryKey: key, queryFn: () => api.players(server.id, kind) })
  const done = ({ via }: { via: 'console' | 'file' }) => {
    toast.success(via === 'console' ? t('config.playersSent') : t('config.playersSaved'))
    client.invalidateQueries({ queryKey: key })
    client.invalidateQueries({ queryKey: ['roster', server.id] })
    if (via === 'console') setTimeout(() => client.invalidateQueries({ queryKey: key }), 1500)
  }
  const add = useMutation({
    mutationFn: (name: string) => api.addPlayer(server.id, kind, name),
    onSuccess: (result) => {
      setDraft('')
      done(result)
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const remove = useMutation({ mutationFn: (name: string) => api.removePlayer(server.id, kind, name), onSuccess: done, onError: (e) => toast.error(errorMessage(e, t)) })
  const value = draft.trim()
  const valid = PLAYER_NAME.test(value) && !players.data?.some((p) => p.name.toLowerCase() === value.toLowerCase())
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) add.mutate(value)
  }
  return (
    <div className="flex flex-col gap-4">
      {config.description ? <p className="text-[0.8125rem] text-muted-foreground">{text(config.description)}</p> : null}
      <form onSubmit={submit} className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('config.playerPlaceholder')} aria-label={t('config.playerPlaceholder')} />
        <Button type="submit" variant="accent" disabled={!valid} loading={add.isPending}>
          <RiAddFill />
          {t('config.listAdd')}
        </Button>
      </form>
      {players.isPending ? (
        <Skeleton className="h-40" />
      ) : players.error ? (
        <EmptyState title={errorMessage(players.error, t)} />
      ) : players.data.length ? (
        <Card className="flex flex-col p-1.5">
          {players.data.map((p) => (
            <div key={p.uuid ?? p.name} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
              <PlayerHead serverId={server.id} name={p.name} avatar={avatar} className="size-8 rounded-md text-base" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="truncate font-mono text-xs text-subtle-foreground">{[p.uuid, p.reason, p.level !== null ? t('config.opLevel', { level: p.level }) : null].filter(Boolean).join(' · ')}</div>
              </div>
              <Tooltip content={t('common.delete')}>
                <Button variant="ghost" size="icon-sm" aria-label={t('common.delete')} loading={remove.isPending && remove.variables === p.name} onClick={() => remove.mutate(p.name)}>
                  <RiDeleteBinFill />
                </Button>
              </Tooltip>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState title={t('config.listEmpty')} />
      )}
    </div>
  )
}

function ConfigSkeleton({ config }: { config: ConfigFile }) {
  const sizes = config.groups.map((g) => config.fields.filter((f) => f.group === g.id).length).filter(Boolean)
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-9" />
      {(sizes.length ? sizes : [4, 3]).slice(0, 3).map((count, g) => (
        <section key={g} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Card className="flex flex-col p-1.5">
            {Array.from({ length: Math.min(count, 5) }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-6 px-3.5 py-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5" style={{ width: `${[34, 26, 40, 22, 30][i]}%` }} />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className={cn('h-9 shrink-0', ['w-56', 'w-36', 'h-5 w-9 rounded-full', 'w-72', 'w-36'][i])} />
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  )
}

function PropertiesEditor({ server, config, icon }: { server: Server; config: ConfigFile; icon?: string }) {
  const { t } = useTranslation()
  const text = useText()
  const client = useQueryClient()
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const file = useQuery({
    queryKey: keys.file(server.id, config.path),
    queryFn: async () => {
      try {
        return { ...(await api.readFile(server.id, config.path)), missing: false }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { content: '', missing: true }
        throw e
      }
    },
    retry: false,
  })
  const base = file.data?.missing ? (config.defaults ?? '') : (file.data?.content ?? '')
  const save = useMutation({
    mutationFn: () => api.writeFile(server.id, config.path, (config.format === 'json' ? updateJsonConfig : updateProperties)(base, changes)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.file(server.id, config.path) })
      setChanges({})
      toast.success(server.status === 'offline' ? t('config.saved') : t('config.savedRestart'))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  if (file.isPending) return <ConfigSkeleton config={config} />
  if (file.error) return <EmptyState title={errorMessage(file.error, t)} />

  const fieldDefaults = Object.fromEntries(config.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default!]))
  const saved = { ...fieldDefaults, ...(config.format === 'json' ? parseJsonConfig : parseProperties)(base) }
  const current = { ...saved, ...changes }
  const set = (key: string, value: string) =>
    setChanges((c) => {
      const next = { ...c }
      if (value === saved[key]) delete next[key]
      else next[key] = value
      return next
    })
  const reset = (key: string) =>
    setChanges((c) => {
      const next = { ...c }
      delete next[key]
      return next
    })
  const needle = query.trim().toLowerCase()
  const matches = (field: Field) => !needle || [field.key, field.name ? text(field.name) : '', field.description ? text(field.description) : ''].join(' ').toLowerCase().includes(needle)
  const groupOf = (f: ConfigField) => (config.groups.some((g) => g.id === f.group) ? f.group! : '')
  const known = new Set(config.fields.map((f) => f.key))
  const rest: Field[] = Object.keys(current)
    .filter((k) => !known.has(k))
    .sort()
    .map((key) => ({ key, type: guessType(saved[key] ?? current[key] ?? '') }))
  const groups = [...config.groups, { id: '', name: t('config.ungrouped') }]
    .map((g) => ({ ...g, fields: config.fields.filter((f) => groupOf(f) === g.id && matches(f)) }))
    .filter((g) => g.fields.length)
  const restShown = rest.filter(matches)
  const openRest = advanced || Boolean(needle)
  const count = Object.keys(changes).length
  const context = { name: server.name, players: `0/${current['max-players'] ?? 20}`, icon }
  const row = (field: Field) => <Row key={field.key} field={field} value={current[field.key] ?? ''} changed={field.key in changes} onChange={(v) => set(field.key, v)} onReset={() => reset(field.key)} context={context} />

  return (
    <div className="flex flex-col gap-6">
      {file.data.missing ? (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm">
          <RiInformationFill className="mt-0.5 size-4 shrink-0 text-info" />
          <div>
            <div className="font-medium text-info">{t('config.missing')}</div>
            <div className="text-muted-foreground">{t('config.missingHint')}</div>
          </div>
        </div>
      ) : null}
      <div className="relative">
        <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('config.search')} aria-label={t('config.search')} className="pl-9" />
      </div>
      {groups.map((g) => (
        <Section key={g.id || 'other'} icon={g.id} title={text(g.name)} description={'description' in g && g.description ? text(g.description) : undefined}>
          {g.fields.map(row)}
        </Section>
      ))}
      {rest.length ? (
        <Card className="flex flex-col p-1.5">
          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            disabled={Boolean(needle)}
            aria-expanded={openRest}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
          >
            <GroupIcon id="advanced" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold tracking-tight">{t('config.other')}</span>
              <span className="block text-[0.8125rem] text-muted-foreground">{t('config.otherHint', { count: rest.length })}</span>
            </span>
            {needle ? null : <RiArrowDownSLine className={cn('size-5 shrink-0 text-muted-foreground transition-transform', openRest && 'rotate-180')} />}
          </button>
          {openRest ? restShown.map(row) : null}
        </Card>
      ) : null}
      {needle && !groups.length && !restShown.length ? <EmptyState title={t('config.nothingFound')} /> : null}
      <SaveBar count={count} saving={save.isPending} onCancel={() => setChanges({})} onSave={() => save.mutate()} />
    </div>
  )
}

export function ServerConfig({ server, game, online }: { server: Server; game: GameTemplate; online: string[] }) {
  const { t } = useTranslation()
  const text = useText()
  const managed = Boolean(game.players)
  const [params, setParams] = useSearchParams()
  const requested = params.get('config')
  const path = requested && (game.configs.some((c) => c.path === requested) || (managed && requested === PLAYERS_TAB)) ? requested : game.configs[0]!.path
  const setPath = (next: string) => setParams((p) => ({ ...Object.fromEntries(p), config: next }), { replace: true })
  const config = game.configs.find((c) => c.path === path)
  const tabs = [...game.configs.map((c) => ({ value: c.path, label: text(c.name) })), ...(managed ? [{ value: PLAYERS_TAB, label: t('players.tab') }] : [])]
  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 ? <Segmented size="sm" value={config ? config.path : PLAYERS_TAB} onChange={setPath} options={tabs} /> : null}
      {!config ? (
        <PlayerManager server={server} spec={game.players!} online={online} />
      ) : config.format === 'bepinex' ? (
        <BepinexEditor key={config.path} server={server} config={config} context={{ name: server.name, players: '', icon: server.icon ?? game.icon }} />
      ) : config.format === 'list' ? (
        <ListEditor key={config.path} server={server} config={config} />
      ) : config.format === 'players' ? (
        <PlayersEditor key={config.path} server={server} config={config} avatar={game.players?.avatar} />
      ) : (
        <PropertiesEditor key={config.path} server={server} config={config} icon={server.icon ?? game.icon} />
      )}
    </div>
  )
}
