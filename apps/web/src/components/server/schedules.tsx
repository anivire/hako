import { RiAddFill, RiArrowDownSLine, RiArrowUpSLine, RiCalendarScheduleFill, RiCloseFill, RiDeleteBin6Fill, RiEditFill, RiErrorWarningFill, RiPlayFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type GameTemplate, type Schedule, type ScheduleAction, type ScheduleInput, type SchedulesOverview, type Server, nextCronRun } from '@hako/shared'
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Code, Dialog, DialogContent, EmptyState, Field, Input, Select, Skeleton, Switch, Tooltip, cn, toast } from '@hako/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { can } from '../../lib/access'
import { ask } from '../../lib/confirm'
import { errorMessage, keys } from '../../lib/queries'

type ActionType = ScheduleAction['type']
const TYPES: ActionType[] = ['say', 'wait', 'command', 'backup', 'restart', 'stop', 'start']
const PRESETS = ['0 5 * * *', '0 */6 * * *', '0 * * * *', '0 5 * * 1']

function blank(type: ActionType): ScheduleAction {
  if (type === 'command') return { type, command: '' }
  if (type === 'say') return { type, message: '' }
  if (type === 'wait') return { type, seconds: 60 }
  return { type }
}

function useActionLabel() {
  const { t } = useTranslation()
  return (a: ScheduleAction) => {
    if (a.type === 'command') return `${t('schedules.actions.command')}: ${a.command}`
    if (a.type === 'say') return `${t('schedules.actions.say')}: ${a.message}`
    if (a.type === 'wait') return t('schedules.waitFor', { count: a.seconds })
    return t(`schedules.actions.${a.type}`)
  }
}

function ActionEditor({ action, chat, onChange }: { action: ScheduleAction; chat: boolean; onChange: (next: ScheduleAction) => void }) {
  const { t } = useTranslation()
  if (action.type === 'command') return <Input value={action.command} placeholder={t('schedules.commandPlaceholder')} onChange={(e) => onChange({ ...action, command: e.target.value })} className="font-mono" />
  if (action.type === 'say') return <Input value={action.message} disabled={!chat} placeholder={chat ? t('schedules.sayPlaceholder') : t('schedules.noChat')} onChange={(e) => onChange({ ...action, message: e.target.value })} />
  if (action.type === 'wait')
    return (
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Input type="number" min={1} max={3600} value={action.seconds} onChange={(e) => onChange({ ...action, seconds: Math.max(1, Math.min(3600, Math.round(Number(e.target.value)) || 1)) })} className="w-24" />
        {t('schedules.seconds')}
      </label>
    )
  return null
}

function ScheduleDialog({ server, game, initial, onClose }: { server: Server; game: GameTemplate; initial: Schedule | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const chat = Boolean(game.console.chat?.say)
  const [draft, setDraft] = useState<ScheduleInput>(() =>
    initial
      ? { name: initial.name, cron: initial.cron, actions: initial.actions, enabled: initial.enabled }
      : {
          name: t('schedules.defaultName'),
          cron: '0 5 * * *',
          enabled: true,
          actions: [...(chat ? [{ type: 'say', message: t('schedules.defaultWarning') } as const, { type: 'wait', seconds: 300 } as const] : []), { type: 'backup' }, { type: 'restart' }],
        },
  )
  const [adding, setAdding] = useState<ActionType>('command')
  const next = nextCronRun(draft.cron)
  const save = useMutation({
    mutationFn: () => (initial ? api.updateSchedule(server.id, initial.id, draft) : api.createSchedule(server.id, draft)),
    onSuccess: (data) => {
      client.setQueryData(keys.schedules(server.id), data)
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const setAction = (i: number, action: ScheduleAction) => setDraft({ ...draft, actions: draft.actions.map((a, j) => (j === i ? action : a)) })
  const move = (i: number, by: number) => {
    const list = [...draft.actions]
    const [item] = list.splice(i, 1)
    list.splice(i + by, 0, item!)
    setDraft({ ...draft, actions: list })
  }
  const invalid = !draft.name.trim() || !next || !draft.actions.length || draft.actions.some((a) => (a.type === 'command' && !a.command.trim()) || (a.type === 'say' && !a.message.trim()))
  return (
    <DialogContent title={initial ? t('schedules.edit') : t('schedules.add')} className="w-[min(92vw,38rem)]">
      <form
        className="flex flex-col gap-4 px-6 pb-5 pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!invalid) save.mutate()
        }}
      >
        <Field label={t('schedules.name')}>
          <Input value={draft.name} maxLength={64} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field
          label={t('schedules.cron')}
          hint={next ? t('schedules.nextRun', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(next) }) : undefined}
          error={next ? undefined : t('schedules.cronInvalid')}
        >
          <Input value={draft.cron} onChange={(e) => setDraft({ ...draft, cron: e.target.value })} className="font-mono" placeholder="0 5 * * *" />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((cron) => (
              <button key={cron} type="button" onClick={() => setDraft({ ...draft, cron })} className={cn('cursor-pointer rounded-md px-2 py-1 text-xs hover:bg-foreground/[0.08]', draft.cron === cron ? 'bg-accent-soft text-accent' : 'bg-foreground/[0.05] text-muted-foreground')}>
                {t(`schedules.presets.${PRESETS.indexOf(cron)}`)}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex flex-col gap-2">
          <div className="text-[0.8125rem] font-medium">{t('schedules.steps')}</div>
          {draft.actions.map((action, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-foreground/[0.04] px-3 py-2">
              <span className="w-5 text-center text-xs tabular-nums text-subtle-foreground">{i + 1}</span>
              <span className="w-28 shrink-0 text-sm font-medium">{t(`schedules.actions.${action.type}`)}</span>
              <div className="min-w-40 flex-1">
                <ActionEditor action={action} chat={chat} onChange={(a) => setAction(i, a)} />
              </div>
              <div className="ml-auto flex">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('schedules.up')} disabled={i === 0} onClick={() => move(i, -1)}>
                  <RiArrowUpSLine />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('schedules.down')} disabled={i === draft.actions.length - 1} onClick={() => move(i, 1)}>
                  <RiArrowDownSLine />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('schedules.removeStep')} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}>
                  <RiCloseFill />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Select value={adding} onValueChange={(v) => setAdding(v as ActionType)} options={TYPES.map((type) => ({ value: type, label: t(`schedules.actions.${type}`), hint: t(`schedules.hints.${type}`) }))} className="w-56" />
            <Button type="button" disabled={draft.actions.length >= 30} onClick={() => setDraft({ ...draft, actions: [...draft.actions, blank(adding)] })}>
              <RiAddFill />
              {t('schedules.addStep')}
            </Button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="accent" disabled={invalid} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}

function ScheduleRow({ server, schedule, onEdit }: { server: Server; schedule: Schedule; onEdit: () => void }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const label = useActionLabel()
  const manage = can(server, 'manage')
  const onData = (data: SchedulesOverview) => client.setQueryData(keys.schedules(server.id), data)
  const onError = (e: Error) => toast.error(errorMessage(e, t))
  const { id, lastRunAt, lastError, nextRunAt, running, ...input } = schedule
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api.updateSchedule(server.id, id, { ...input, enabled }), onSuccess: onData, onError })
  const run = useMutation({ mutationFn: () => api.runSchedule(server.id, id), onSuccess: onData, onError })
  const remove = useMutation({ mutationFn: () => api.deleteSchedule(server.id, id), onSuccess: onData, onError })
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <Switch checked={schedule.enabled} disabled={!manage || toggle.isPending} onCheckedChange={(on) => toggle.mutate(on)} className="mt-0.5" aria-label={schedule.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{schedule.name}</span>
          <Code>{schedule.cron}</Code>
          {running ? <Badge variant="accent">{t('schedules.running')}</Badge> : null}
          {lastError ? (
            <Tooltip content={lastError}>
              <Badge variant="danger">
                <RiErrorWarningFill />
                {t('schedules.failed')}
              </Badge>
            </Tooltip>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{schedule.actions.map(label).join(' → ')}</div>
        <div className="mt-0.5 text-xs text-subtle-foreground">
          {nextRunAt ? t('schedules.nextRun', { date: date(nextRunAt) }) : t('schedules.off')}
          {lastRunAt ? ` · ${t('schedules.lastRun', { date: date(lastRunAt) })}` : ''}
        </div>
      </div>
      {manage ? (
        <div className="flex shrink-0">
          <Tooltip content={t('schedules.runNow')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('schedules.runNow')} disabled={running} loading={run.isPending} onClick={() => run.mutate()}>
              <RiPlayFill />
            </Button>
          </Tooltip>
          <Tooltip content={t('schedules.edit')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('schedules.edit')} onClick={onEdit}>
              <RiEditFill />
            </Button>
          </Tooltip>
          <Tooltip content={t('schedules.delete')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('schedules.delete')} loading={remove.isPending} onClick={() => void ask({ title: t('schedules.confirmDelete', { name: schedule.name }), confirm: t('schedules.delete'), danger: true }).then((ok) => ok && remove.mutate())}>
              <RiDeleteBin6Fill />
            </Button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  )
}

export function ServerSchedules({ server, game }: { server: Server; game: GameTemplate }) {
  const { t } = useTranslation()
  const overview = useQuery({ queryKey: keys.schedules(server.id), queryFn: () => api.schedules(server.id), refetchInterval: (q) => (q.state.data?.schedules.some((s) => s.running) ? 3000 : 60_000) })
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null)
  return (
    <Card>
      <CardHeader className="flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>{t('schedules.title')}</CardTitle>
          <CardDescription>{t('schedules.hint', { zone: overview.data?.timeZone ?? 'UTC' })}</CardDescription>
        </div>
        {can(server, 'manage') ? (
          <Button variant="accent" onClick={() => setEditing('new')}>
            <RiAddFill />
            {t('schedules.add')}
          </Button>
        ) : null}
      </CardHeader>
      <div className="flex flex-col pb-2">
        {overview.isPending ? (
          <div className="px-5 py-3">
            <Skeleton className="h-12" />
          </div>
        ) : overview.data?.schedules.length ? (
          overview.data.schedules.map((s) => <ScheduleRow key={s.id} server={server} schedule={s} onEdit={() => setEditing(s)} />)
        ) : (
          <div className="px-5 pb-3">
            <EmptyState icon={<RiCalendarScheduleFill className="size-10 text-subtle-foreground" />} title={t('schedules.empty')} description={t('schedules.emptyHint')} />
          </div>
        )}
      </div>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? <ScheduleDialog key={editing === 'new' ? 'new' : editing.id} server={server} game={game} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      </Dialog>
    </Card>
  )
}
