import { RiArrowDownSLine, RiArrowLeftSLine, RiArrowRightSLine, RiCheckFill, RiCheckboxCircleFill, RiErrorWarningFill } from '@remixicon/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GameTemplate, GameVariable, Server } from '@hako/shared'
import { Button, Card, EmptyState, Field, Input, Segmented, Skeleton, cn } from '@hako/ui'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTransitionNavigate } from '../components/transition-link'
import { Page, PageHeader } from '../components/app-shell'
import { GameIcon, ServerAvatar } from '../components/game-icon'
import { StartupPreview } from '../components/startup-preview'
import { GroupIcon } from '../lib/group-icons'
import { ServerSummary } from './server'
import { VariablesForm, focusVariable, groupOf, useVariableValue, variableErrors, visibleVariables, withDefaults } from '../components/variables-form'
import { ApiError } from '../lib/api'
import { api } from '../lib/api'
import { useText } from '../lib/i18n'
import { errorMessage, keys, useGames } from '../lib/queries'
import { useDebounced } from '../lib/use-debounced'

type Step = 'game' | 'setup' | 'settings' | 'review'

const MEMORY_PRESETS = [1024, 2048, 4096, 6144, 8192, 12288, 16384]

function Stepper({ steps, current, onSelect }: { steps: Step[]; current: number; onSelect: (index: number) => void }) {
  const { t } = useTranslation()
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={step} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden className="h-px w-6 bg-foreground/15" /> : null}
            <button
              type="button"
              disabled={!done}
              onClick={() => onSelect(i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-colors',
                active ? 'bg-accent-soft text-accent' : done ? 'cursor-pointer text-foreground hover:bg-muted' : 'text-subtle-foreground',
              )}
            >
              <span className={cn('grid size-6 place-items-center rounded-full text-xs', active ? 'bg-accent text-accent-foreground' : done ? 'bg-success-soft text-success' : 'bg-foreground/[0.06]')}>
                {done ? <RiCheckFill className="size-3.5" /> : i + 1}
              </span>
              {t(`wizard.steps.${step}`)}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function sizeLabel(mb: number) {
  return mb >= 1024 ? `${Number((mb / 1024).toFixed(1))} GB` : `${mb} MB`
}

function hasMods(game: GameTemplate) {
  return game.addons.length > 0 || game.variables.some((v) => v.options?.some((o) => o.template?.addons?.length))
}

function GameStep({ games, value, onChange }: { games: GameTemplate[]; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation()
  const text = useText()
  return (
    <div role="radiogroup" className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {games.map((g) => {
        const active = g.id === value
        const variants = g.variables.find((v) => (v.options?.filter((o) => o.icon).length ?? 0) > 1)?.options?.filter((o) => o.icon) ?? []
        return (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(g.id)}
            className={cn(
              'relative flex cursor-pointer flex-col gap-4 rounded-xl p-5 text-left transition-[background-color,box-shadow]',
              active ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'bg-surface hover:bg-muted',
            )}
          >
            {active ? (
              <span className="absolute right-4 top-4 grid size-6 place-items-center rounded-full bg-accent text-accent-foreground">
                <RiCheckFill className="size-4" />
              </span>
            ) : null}
            <span className="grid size-14 place-items-center rounded-2xl bg-foreground/[0.05]">
              <GameIcon src={g.icon} fallback={text(g.name)} className="size-11 rounded-xl" />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-base font-semibold tracking-tight', active && 'text-accent')}>{text(g.name)}</span>
              <span className="mt-1 line-clamp-2 block min-h-[2lh] text-[0.8125rem] text-muted-foreground">{g.description ? text(g.description) : null}</span>
            </span>
            <span className="mt-auto flex flex-wrap items-center gap-1.5">
              {variants.length ? (
                <span className="flex items-center gap-1 rounded-full bg-foreground/[0.05] py-1 pl-1.5 pr-2">
                  {variants.slice(0, 7).map((o) => (
                    <span key={o.value} title={text(o.label) || o.value} className="grid size-5 place-items-center text-muted-foreground">
                      <GameIcon src={o.icon} className="size-4 rounded-[3px]" />
                    </span>
                  ))}
                  {variants.length > 7 ? <span className="text-xs text-muted-foreground">+{variants.length - 7}</span> : null}
                </span>
              ) : null}
              {hasMods(g) ? <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-muted-foreground">{t('wizard.mods')}</span> : null}
              <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-muted-foreground">{t('wizard.minMemory', { size: sizeLabel(g.memory.min) })}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SummaryRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-sm">{children}</span>
    </div>
  )
}

function VariableValue({ game, variable, values }: { game: GameTemplate; variable: GameVariable; values: Record<string, string> }) {
  const { t } = useTranslation()
  const value = useVariableValue(game, variable, values)
  if (variable.type === 'boolean') return value === 'true' ? t('common.yes') : t('common.no')
  if (!value) return variable.source ? t('variables.latest') : <span className="text-subtle-foreground">—</span>
  if (/PASS/.test(variable.key)) return '•'.repeat(Math.min(value.length, 12))
  return value === 'LATEST' ? t('variables.latest') : value.split(' — ')[0]
}

function WizardSection({
  icon,
  title,
  description,
  collapsible,
  count,
  forceOpen,
  children,
}: {
  icon: string
  title: ReactNode
  description?: ReactNode
  collapsible?: boolean
  count?: number
  forceOpen?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(!collapsible)
  const open = opened || Boolean(forceOpen)
  if (!collapsible)
    return (
      <Card className="flex flex-col gap-5 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <GroupIcon id={icon} />
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h3>
            {description ? <p className="text-[0.8125rem] text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {children}
      </Card>
    )
  return (
    <Card className="overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpened(!open)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted sm:px-5">
        <GroupIcon id={icon} />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold tracking-tight">{title}</span>
          {description ? <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{description}</span> : null}
        </span>
        {open ? null : <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{t('wizard.fields', { count })}</span>}
        <RiArrowDownSLine className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="flex flex-col gap-5 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">{children}</div> : null}
    </Card>
  )
}

function Wizard({ games }: { games: GameTemplate[] }) {
  const { t } = useTranslation()
  const text = useText()
  const navigate = useTransitionNavigate()
  const client = useQueryClient()
  const [gameId, setGameId] = useState(games[0]!.id)
  const game = games.find((g) => g.id === gameId) ?? games[0]!
  const [index, setIndex] = useState(0)
  const [name, setName] = useState('')
  const [pick, setPick] = useState<{ key: string; label: string; icon: string | null } | null>(null)
  const [memory, setMemory] = useState<number | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [ports, setPorts] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Record<string, File>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [rejected, setRejected] = useState<Record<string, string>>({})
  const steps: Step[] = game.variables.some((v) => v.step === 'setup') ? ['game', 'setup', 'settings', 'review'] : ['game', 'settings', 'review']
  const step = steps[index]!
  const portKey = useDebounced(JSON.stringify(Object.fromEntries(Object.entries(ports).filter(([, v]) => /^\d+$/.test(v)))))
  const portChecks = useQuery({
    queryKey: ['ports', game.id, portKey],
    queryFn: () => api.portCheck(game.id, JSON.parse(portKey) as Record<string, string>),
    enabled: step === 'settings' || step === 'review',
    placeholderData: keepPreviousData,
    staleTime: 5000,
  })
  const suggestion = pick && visibleVariables(game, variables).some((v) => v.key === pick.key) ? pick : null
  const finalName = name.trim() || suggestion?.label.slice(0, 64) || text(game.name).slice(0, 64)
  const mem = memory ?? game.memory.default
  const create = useMutation({
    mutationFn: async () => {
      const server = await api.createServer({
        name: finalName,
        icon: suggestion?.icon ?? null,
        game: game.id,
        memory: mem,
        variables: withDefaults(game, variables),
        ports: Object.fromEntries(
          Object.entries(ports)
            .filter(([, v]) => v !== '')
            .map(([k, v]) => [k, Number(v)]),
        ),
      })
      for (const v of visibleVariables(game, variables)) {
        const file = files[v.key]
        if (v.file && file) await api.upload(server.id, v.file.path, file)
      }
      return server
    },
    onSuccess: (server) => {
      client.setQueryData<Server[]>(keys.servers, (list) => [...(list ?? []).filter((s) => s.id !== server.id), server])
      client.setQueryData(keys.server(server.id), server)
      client.invalidateQueries({ queryKey: keys.servers, exact: true })
      navigate(`/servers/${server.id}`)
    },
    onError: (e) => {
      const [code, key] = e instanceof ApiError ? e.message.split(':') : []
      const variable = code === 'VARIABLE_INVALID' ? game.variables.find((v) => v.key === key) : undefined
      if (!variable) return setProblem(errorMessage(e, t))
      setRejected({ [variable.key]: t('wizard.errors.rejected') })
      setIndex(steps.indexOf(variable.step === 'setup' ? 'setup' : 'settings'))
      setTimeout(() => focusVariable(variable.key), 50)
    },
  })
  const pickGame = (id: string) => {
    if (id === gameId) return
    setGameId(id)
    setVariables({})
    setPick(null)
    setPorts({})
    setFiles({})
    setMemory(null)
  }
  const stepErrors = step === 'setup' || step === 'settings' ? variableErrors(game, variables, step) : {}
  const fieldErrors: Record<string, string> = Object.fromEntries([
    ...(checked ? Object.entries(stepErrors).map(([key, code]) => [key, t(`wizard.errors.${code}`)]) : []),
    ...Object.entries(rejected).filter(([key]) => !(key in stepErrors)),
  ])
  const firstError = Object.keys(fieldErrors)[0]
  const missing = firstError ? game.variables.find((v) => v.key === firstError) : undefined
  const validate = (): boolean => {
    const keys = Object.keys(stepErrors)
    if (keys.length) {
      setChecked(true)
      setTimeout(() => focusVariable(keys[0]!), 50)
      return false
    }
    if (step === 'settings' && portChecks.data?.some((c) => c.requested !== null && !c.free)) {
      setTimeout(() => document.querySelector<HTMLInputElement>('[id^="port-"][aria-invalid="true"]')?.focus(), 50)
      return false
    }
    return true
  }
  const portsBusy = Boolean(portChecks.data?.some((c) => c.requested !== null && !c.free))
  const startupKey = /\{\{\s*([A-Z][A-Z0-9_]*)/.exec(game.startup?.replace(/\{\{\s*SERVER_[A-Z_]+\s*\}\}/g, '') ?? '')?.[1]
  const startupVariable = game.variables.find((v) => v.key === startupKey && v.step !== 'setup')
  const startupGroup = startupVariable ? groupOf(game, startupVariable) : null
  const groups = [...game.groups, { id: '', name: t('settings.other'), description: undefined, collapsed: false }]
    .map((g) => ({ ...g, count: visibleVariables(game, variables, 'settings', g.id).length }))
    .filter((g) => g.count)
  const next = () => {
    setProblem(null)
    if (!validate()) return
    setChecked(false)
    setIndex(index + 1)
  }
  const back = () => {
    setProblem(null)
    setChecked(false)
    setIndex(index - 1)
  }
  return (
    <>
      <Stepper steps={steps} current={index} onSelect={(i) => setIndex(i)} />
      {step === 'game' ? <GameStep games={games} value={game.id} onChange={pickGame} /> : null}
      {step === 'setup' ? (
        <Card className="p-4 sm:p-5">
          <VariablesForm
            game={game}
            values={variables}
            onChange={(next) => {
              setVariables(next)
              setRejected({})
            }}
            onPick={(key, option) => setPick(option ? { key, label: text(option.label), icon: option.icon ?? null } : null)}
            onFile={(key, file) => setFiles({ ...files, [key]: file })}
            step="setup"
            errors={fieldErrors}
          />
        </Card>
      ) : null}
      {step === 'settings' ? (
        <div className="flex flex-col gap-6">
          <WizardSection icon="server" title={t('wizard.server')}>
            <Field label={t('servers.name')} htmlFor="server-name">
              <div className="flex items-center gap-3">
                <ServerAvatar game={game} values={withDefaults(game, variables)} icon={suggestion?.icon} size={36} />
                <Input id="server-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={suggestion?.label || text(game.name)} autoFocus />
              </div>
            </Field>
            <Field label={t('servers.memoryPick')} hint={t('servers.memoryMin', { size: sizeLabel(game.memory.min) })}>
              <Segmented
                value={String(mem)}
                onChange={(value) => setMemory(Number(value))}
                options={[...new Set([...MEMORY_PRESETS.filter((m) => m >= game.memory.min), mem])].sort((a, b) => a - b).map((m) => ({ value: String(m), label: sizeLabel(m) }))}
                className="max-w-full"
              />
            </Field>
          </WizardSection>
          <WizardSection icon="network" title={t('wizard.network')} description={t('wizard.networkHint')} collapsible count={game.ports.length} forceOpen={portsBusy}>
            {game.ports.map((p) => {
              const check = portChecks.data?.find((c) => c.name === p.name)
              const requested = ports[p.name]
              const hint = !check ? t('servers.portHint') : !requested ? t('servers.portAuto', { port: check.port }) : null
              return (
                <Field key={p.name} label={t('servers.port', { name: p.name, protocol: p.protocol.toUpperCase() })} hint={hint ?? undefined} htmlFor={`port-${p.name}`}>
                  <Input
                    id={`port-${p.name}`}
                    aria-invalid={check && requested && check.requested !== null && !check.free ? true : undefined}
                    type="number"
                    min={1}
                    max={65535}
                    placeholder={String(check?.port ?? p.container)}
                    value={requested ?? ''}
                    onChange={(e) => setPorts({ ...ports, [p.name]: e.target.value })}
                    className="sm:max-w-48"
                  />
                  {check && requested && check.requested !== null ? (
                    check.free ? (
                      <p className="flex items-center gap-1.5 text-xs text-success">
                        <RiCheckboxCircleFill className="size-3.5" />
                        {t('servers.portFree', { port: check.requested })}
                      </p>
                    ) : (
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-danger">
                        <RiErrorWarningFill className="size-3.5" />
                        {t('servers.portBusy', { port: check.requested })}
                        <button type="button" className="cursor-pointer font-medium text-accent hover:underline" onClick={() => setPorts({ ...ports, [p.name]: String(check.port) })}>
                          {t('servers.portUse', { port: check.port })}
                        </button>
                      </p>
                    )
                  ) : null}
                </Field>
              )
            })}
          </WizardSection>
          {groups.map((g) => (
            <WizardSection
              key={g.id || 'other'}
              icon={g.id}
              title={text(g.name)}
              description={g.description ? text(g.description) : undefined}
              collapsible={g.collapsed}
              count={g.count}
              forceOpen={missing ? groupOf(game, missing) === g.id : false}
            >
              <VariablesForm
                game={game}
                values={variables}
                onChange={(next) => {
                  setVariables(next)
                  setRejected({})
                }}
                onFile={(key, file) => setFiles({ ...files, [key]: file })}
                step="settings"
                group={g.id}
                errors={fieldErrors}
              />
              {g.id === startupGroup ? <StartupPreview game={game} values={withDefaults(game, variables)} memory={mem} /> : null}
            </WizardSection>
          ))}
          {startupGroup === null ? <StartupPreview game={game} values={withDefaults(game, variables)} memory={mem} /> : null}
        </div>
      ) : null}
      {step === 'review' ? (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <ServerAvatar game={game} values={withDefaults(game, variables)} icon={suggestion?.icon} size={56} ring="var(--color-surface)" />
            <div className="min-w-0 flex-1">
              <div className="break-words text-xl font-semibold tracking-tight">{finalName}</div>
              <div className="text-[0.9375rem] text-muted-foreground">
                <ServerSummary game={game} values={withDefaults(game, variables)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-muted-foreground">{sizeLabel(mem)}</span>
              {game.ports.map((p) => (
                <span key={p.name} className="rounded-full bg-foreground/[0.05] px-2.5 py-1 font-mono text-xs text-muted-foreground">
                  {p.name} · {ports[p.name] || portChecks.data?.find((c) => c.name === p.name)?.port || t('wizard.auto')}/{p.protocol}
                </span>
              ))}
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {[...game.groups, { id: '', name: t('settings.other') }]
              .map((g) => ({ ...g, vars: visibleVariables(game, variables, undefined, g.id) }))
              .filter((g) => g.vars.length)
              .map((g) => (
                <Card key={g.id || 'other'} className="flex flex-col p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <GroupIcon id={g.id} />
                    <h3 className="text-[0.9375rem] font-semibold tracking-tight">{text(g.name)}</h3>
                  </div>
                  <div className="flex flex-col">
                    {g.vars.map((v) => (
                      <SummaryRow key={v.key} label={v.link ? `${text(v.name)} ${text(v.link.text)}` : text(v.name)}>
                        <VariableValue game={game} variable={v} values={variables} />
                      </SummaryRow>
                    ))}
                  </div>
                </Card>
              ))}
          </div>
        </div>
      ) : null}
      {problem ? <p className="mt-4 text-sm text-danger">{problem}</p> : null}
      <div className="mt-6 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={back} disabled={index === 0}>
          <RiArrowLeftSLine />
          {t('wizard.back')}
        </Button>
        {step === 'review' ? (
          <Button variant="accent" loading={create.isPending} onClick={() => create.mutate()}>
            {t('servers.create')}
          </Button>
        ) : (
          <Button variant="accent" onClick={next}>
            {t('wizard.next')}
            <RiArrowRightSLine />
          </Button>
        )}
      </div>
    </>
  )
}

export function NewServerPage() {
  const { t } = useTranslation()
  const games = useGames()
  return (
    <Page>
      <PageHeader title={t('servers.new')} description={t('wizard.description')} />
      {games.isPending ? <Skeleton className="h-64" /> : games.data?.length ? <Wizard games={games.data} /> : <EmptyState title={errorMessage(games.error, t)} />}
    </Page>
  )
}
