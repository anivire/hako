import { RiArrowDownSLine, RiCheckFill, RiFileUploadFill, RiSearchFill } from '@remixicon/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type GameTemplate, type GameVariable, type VariableOption, variableVisible } from '@hako/shared'
import { Field, Input, Popover, PopoverContent, PopoverTrigger, Segmented, Select, Skeleton, Switch, cn } from '@hako/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useText } from '../lib/i18n'
import { errorMessage } from '../lib/queries'
import { useDebounced } from '../lib/use-debounced'
import { GameIcon } from './game-icon'

const PLACEHOLDER = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

export function withDefaults(game: GameTemplate, values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(game.variables.map((v) => [v.key, values[v.key] ?? v.default]))
}

export function groupOf(game: GameTemplate, variable: GameVariable): string {
  return game.groups.some((g) => g.id === variable.group) ? variable.group! : ''
}

export function visibleVariables(game: GameTemplate, values: Record<string, string>, step?: GameVariable['step'], group?: string) {
  const all = withDefaults(game, values)
  return game.variables.filter((v) => v.step !== 'managed' && !isFilter(game, v) && (!step || v.step === step) && (group === undefined || groupOf(game, v) === group) && variableVisible(v, all))
}

function isFilter(game: GameTemplate, variable: GameVariable) {
  return variable.type === 'boolean' && game.variables.some((v) => dependsOn(v).includes(variable.key))
}

function SourceFilters({ game, variable, values, onFilter, disabled }: { game: GameTemplate; variable: GameVariable; values: Record<string, string>; onFilter: (key: string, value: string) => void; disabled?: boolean }) {
  const text = useText()
  const filters = game.variables.filter((f) => isFilter(game, f) && dependsOn(variable).includes(f.key) && variableVisible(f, values))
  if (!filters.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {filters.map((f) => {
        const on = values[f.key] === 'true'
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onFilter(f.key, on ? 'false' : 'true')}
            className={cn(
              'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5',
              on ? 'bg-accent-soft text-accent' : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground',
            )}
          >
            {on ? <RiCheckFill /> : null}
            {text(f.name)}
          </button>
        )
      })}
    </div>
  )
}

export function missingVariable(game: GameTemplate, values: Record<string, string>, step?: GameVariable['step']): GameVariable | undefined {
  const all = withDefaults(game, values)
  return visibleVariables(game, values, step).find((v) => v.required && (v.type === 'boolean' ? all[v.key] !== 'true' : !all[v.key]?.trim()))
}

function dependsOn(variable: GameVariable): string[] {
  return Object.values(variable.source?.params ?? {}).flatMap((p) => [...p.matchAll(PLACEHOLDER)].map((m) => m[1]!))
}

function useOptions(game: GameTemplate, variable: GameVariable, values: Record<string, string>, query = '') {
  const deps = Object.fromEntries(dependsOn(variable).map((k) => [k, values[k] ?? '']))
  return useQuery({
    queryKey: ['options', game.id, variable.key, query, deps],
    queryFn: () => api.variableOptions(game.id, variable.key, query, deps),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useVariableValue(game: GameTemplate, variable: GameVariable, values: Record<string, string>): string {
  const text = useText()
  const all = withDefaults(game, values)
  const value = all[variable.key] ?? ''
  const deps = Object.fromEntries(dependsOn(variable).map((k) => [k, all[k] ?? '']))
  const options = useQuery({
    queryKey: ['options', game.id, variable.key, '', deps],
    queryFn: () => api.variableOptions(game.id, variable.key, '', deps),
    staleTime: 10 * 60_000,
    enabled: !!variable.source && !variable.source.search,
  })
  const option = options.data?.find((o) => o.value === value) ?? variable.options?.find((o) => o.value === value)
  if (!option) return value
  const latest = value === '' || value === 'LATEST'
  return latest && 'hint' in option && option.hint ? text(option.hint) : text(option.label) || value
}

function OptionGrid({ variable, value, onChange, disabled }: { variable: GameVariable; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const text = useText()
  return (
    <div role="radiogroup" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2">
      {variable.options!.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn('flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', active ? 'bg-accent-soft' : 'bg-foreground/[0.04] hover:bg-foreground/[0.07]')}
          >
            {o.icon ? <GameIcon src={o.icon} className={cn('mt-px size-5 rounded', active ? 'text-accent' : 'text-muted-foreground')} /> : null}
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-medium', active && 'text-accent')}>{text(o.label) || o.value}</span>
              {o.description ? <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{text(o.description)}</span> : null}
            </span>
            {active ? <RiCheckFill className="mt-0.5 size-4 shrink-0 text-accent" /> : null}
          </button>
        )
      })}
    </div>
  )
}

function SourceSelect({ game, variable, values, value, onChange, disabled }: { game: GameTemplate; variable: GameVariable; values: Record<string, string>; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const text = useText()
  const options = useOptions(game, variable, values)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  if (options.isPending) return <Skeleton className="h-9" />
  if (options.error) return <p className="text-[0.8125rem] text-danger">{errorMessage(options.error, t)}</p>
  const list = options.data
  const selected = list.find((o) => o.value === value)
  const needle = filter.trim().toLowerCase()
  const shown = needle ? list.filter((o) => [text(o.label), o.value, o.hint ? text(o.hint) : ''].join(' ').toLowerCase().includes(needle)) : list
  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
    setFilter('')
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || !list.length}>
        <button
          type="button"
          className="inline-flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg bg-foreground/[0.05] px-3 text-left text-sm transition-colors hover:bg-foreground/[0.08] disabled:opacity-50"
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? text(selected.label) : value || <span className="text-subtle-foreground">{t('variables.choose')}</span>}
            {selected?.hint ? <span className="ml-2 text-subtle-foreground">{text(selected.hint)}</span> : null}
          </span>
          <RiArrowDownSLine className="-mr-1 size-5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1.5">
        <div className="relative mb-1.5">
          <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('variables.search')} className="pl-9" autoFocus />
        </div>
        <div role="listbox" className="max-h-72 overflow-y-auto">
          {shown.length ? (
            shown.map((o) => {
              const active = o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(o.value)}
                  className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm', active ? 'bg-accent-soft text-accent' : 'hover:bg-muted')}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block">{text(o.label)}</span>
                    {o.hint ? <span className="block truncate text-xs text-subtle-foreground">{text(o.hint)}</span> : null}
                  </span>
                  {active ? <RiCheckFill className="size-4 shrink-0" /> : null}
                </button>
              )
            })
          ) : (
            <p className="px-3 py-2 text-[0.8125rem] text-muted-foreground">{t('variables.nothingFound')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SourceSearch({ game, variable, values, value, onChange, disabled }: { game: GameTemplate; variable: GameVariable; values: Record<string, string>; value: string; onChange: (value: string, option?: VariableOption) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const text = useText()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const options = useOptions(game, variable, values, q)
  const row = (o: VariableOption) => {
    const active = o.value === value
    return (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={() => onChange(o.value, o)}
        className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', active ? 'bg-accent-soft' : 'hover:bg-muted')}
      >
        {o.icon ? <img src={o.icon} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg bg-field object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-field" />}
        <span className="min-w-0 flex-1">
          <span className={cn('block break-words text-sm font-medium', active && 'text-accent')}>{text(o.label)}</span>
          {o.hint ? <span className="block break-words text-xs text-subtle-foreground">{text(o.hint)}</span> : null}
        </span>
        {active ? <RiCheckFill className="size-4 shrink-0 text-accent" /> : null}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <RiSearchFill className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('variables.search')} disabled={disabled} className="pl-9" />
      </div>
      {value && !options.data?.some((o) => o.value === value) ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          {t('variables.selected')}: <span className="font-mono text-foreground">{value}</span>
        </p>
      ) : null}
      <div role="radiogroup" className="max-h-80 overflow-y-auto rounded-xl bg-foreground/[0.04] p-1.5">
        {options.isPending ? (
          <Skeleton className="h-40" />
        ) : options.error ? (
          <p className="px-2.5 py-3 text-[0.8125rem] text-danger">{errorMessage(options.error, t)}</p>
        ) : !options.data.length ? (
          <p className="px-2.5 py-3 text-[0.8125rem] text-muted-foreground">{t('variables.nothingFound')}</p>
        ) : (
          options.data.map(row)
        )}
      </div>
    </div>
  )
}

function FileField({ id, variable, value, onFile, disabled }: { id: string; variable: GameVariable; value: string; onFile: (file: File) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const accept = variable.file?.accept ?? ''
  const take = (file?: File) => {
    if (file && (!accept || accept.split(',').some((ext) => file.name.toLowerCase().endsWith(ext.trim().toLowerCase())))) onFile(file)
  }
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) take(e.dataTransfer.files[0])
      }}
      className={cn('flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition-colors', over ? 'border-accent bg-accent-soft' : 'border-foreground/15 bg-foreground/[0.03] hover:bg-foreground/[0.06]', disabled && 'pointer-events-none opacity-50')}
    >
      <RiFileUploadFill className={cn('size-5 shrink-0', value ? 'text-accent' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{value || t('variables.pickFile', { accept })}</span>
        <span className="block text-xs text-subtle-foreground">{value ? t('variables.replaceFile') : t('variables.dropFile')}</span>
      </span>
      <input id={id} type="file" accept={accept} disabled={disabled} className="sr-only" onChange={(e) => take(e.target.files?.[0])} />
    </label>
  )
}

function VariableField({ game, variable, values, onChange, onFilter, onFile, disabled, error }: { game: GameTemplate; variable: GameVariable; values: Record<string, string>; onChange: (value: string, option?: VariableOption) => void; onFilter: (key: string, value: string) => void; onFile?: (file: File) => void; disabled?: boolean; error?: string }) {
  const text = useText()
  const value = values[variable.key] ?? ''
  const id = `var-${variable.key}`
  const description = variable.description ? text(variable.description) : undefined
  if (variable.type === 'boolean' && variable.link) {
    const checked = value === 'true'
    return (
      <div className={cn('-mx-3 flex items-start justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors', variable.required && !checked && (error ? 'bg-danger-soft shadow-[inset_0_0_0_1px_var(--color-danger)]' : 'bg-warning-soft'))}>
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-sm">
            {text(variable.name)}{' '}
            <a href={variable.link.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
              {text(variable.link.text)}
            </a>
            {variable.required ? (
              <span aria-hidden className="ml-0.5 text-danger">
                *
              </span>
            ) : null}
          </span>
          {description ? <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{description}</span> : null}
          {error ? (
            <span role="alert" className="mt-1 block text-xs font-medium text-danger">
              {error}
            </span>
          ) : null}
        </label>
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(next ? 'true' : 'false')} />
      </div>
    )
  }
  if (variable.type === 'boolean') {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm">{text(variable.name)}</span>
          {description ? <span className="block break-words text-[0.8125rem] text-muted-foreground">{description}</span> : null}
        </span>
        <Switch id={id} checked={value === 'true'} disabled={disabled} onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')} />
      </label>
    )
  }
  let control
  if (variable.type === 'file') {
    control = (
      <FileField
        id={id}
        variable={variable}
        value={value}
        disabled={disabled || !onFile}
        onFile={(file) => {
          onFile?.(file)
          onChange(file.name)
        }}
      />
    )
  } else if (variable.source) {
    const Picker = variable.source.search ? SourceSearch : SourceSelect
    control = (
      <div className="flex flex-col gap-2">
        <SourceFilters game={game} variable={variable} values={values} onFilter={onFilter} disabled={disabled} />
        <Picker game={game} variable={variable} values={values} value={value} onChange={onChange} disabled={disabled} />
      </div>
    )
  } else if (variable.type === 'select' && variable.options) {
    if (variable.options.some((o) => o.description)) control = <OptionGrid variable={variable} value={value} onChange={onChange} disabled={disabled} />
    else if (variable.options.length <= 4) control = <Segmented value={value} onChange={onChange} options={variable.options.map((o) => ({ value: o.value, label: text(o.label) || o.value, disabled }))} />
    else control = <Select value={value} disabled={disabled} onValueChange={onChange} options={variable.options.map((o) => ({ value: o.value, label: text(o.label) || o.value }))} className="w-full" />
  } else {
    control = <Input id={id} type={variable.type === 'number' ? 'number' : 'text'} value={value} disabled={disabled} required={variable.required} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
  }
  return (
    <Field
      label={text(variable.name)}
      hint={
        variable.link ? (
          <>
            {description}{' '}
            <a href={variable.link.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
              {text(variable.link.text)}
            </a>
          </>
        ) : (
          description
        )
      }
      htmlFor={id}
      required={variable.required}
      error={error}
    >
      {control}
    </Field>
  )
}

export function VariablesForm({
  game,
  values,
  onChange,
  onPick,
  onFile,
  step,
  group,
  existing,
  saved,
  errors,
}: {
  game: GameTemplate
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  onPick?: (key: string, option: VariableOption | null) => void
  onFile?: (key: string, file: File) => void
  step?: GameVariable['step']
  group?: string
  existing?: boolean
  saved?: Record<string, string>
  errors?: Record<string, string>
}) {
  const { t } = useTranslation()
  const all = withDefaults(game, values)
  const before = saved ? withDefaults(game, saved) : null
  const set = (key: string, value: string, option?: VariableOption) => {
    const variable = game.variables.find((v) => v.key === key)
    if (variable?.source?.search) onPick?.(key, option ?? null)
    const next = { ...values, [key]: value }
    for (const v of game.variables) if (dependsOn(v).includes(key)) next[v.key] = v.default
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-5">
      {visibleVariables(game, values, step, group).map((v) => {
        const field = <VariableField key={v.key} game={game} variable={v} values={all} onChange={(value, option) => set(v.key, value, option)} onFilter={(key, value) => set(key, value)} onFile={onFile && ((file) => onFile(v.key, file))} disabled={existing && !v.editable} error={errors?.[v.key]} />
        if (!before || (all[v.key] ?? '') === (before[v.key] ?? '')) return field
        return (
          <div key={v.key} className="-mx-3 flex flex-col gap-2 rounded-lg bg-accent-soft px-3 py-2.5">
            {field}
            <button type="button" onClick={() => set(v.key, before[v.key] ?? '')} className="flex cursor-pointer items-center gap-1.5 self-start text-xs font-medium text-accent hover:underline">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              {t('settings.changedRevert')}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export type VariableError = 'required' | 'invalid' | 'number'

export function variableErrors(game: GameTemplate, values: Record<string, string>, step?: GameVariable['step']): Record<string, VariableError> {
  const all = withDefaults(game, values)
  const out: Record<string, VariableError> = {}
  for (const v of visibleVariables(game, values, step)) {
    const value = (all[v.key] ?? '').trim()
    if (v.required && (v.type === 'boolean' ? value !== 'true' : !value)) out[v.key] = 'required'
    else if (value && v.type === 'number' && !Number.isFinite(Number(value))) out[v.key] = 'number'
    else if (value && v.pattern && !new RegExp(v.pattern).test(value)) out[v.key] = 'invalid'
  }
  return out
}

export function focusVariable(key: string) {
  const element = document.getElementById(`var-${key}`)
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  element?.focus({ preventScroll: true })
}
