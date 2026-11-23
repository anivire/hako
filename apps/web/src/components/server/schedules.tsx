import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RiAddFill, RiArchiveStackFill, RiArrowRightSLine, RiChat3Fill, RiCloseFill, RiDraggable, RiDeleteBin6Fill, RiEditFill, RiErrorWarningFill, RiPlayFill, RiRestartFill, RiStopFill, RiTerminalBoxFill, RiTimerFill, type RemixiconComponentType } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type GameTemplate, type Schedule, type ScheduleAction, type ScheduleInput, type SchedulesOverview, type Server, nextCronRun } from '@hako/shared'
import { Badge, Button, Card, CardDescription, CardTitle, Dialog, DialogContent, EmptyState, Field, Input, Select, Skeleton, Switch, Tooltip, cn, toast } from '@hako/ui'
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { can } from '../../lib/access'
import { ask } from '../../lib/confirm'
import { errorMessage, keys } from '../../lib/queries'
import { restrictToVertical } from '../layout-settings'

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

interface Step {
  id: string
  action: ScheduleAction
}

let stepCounter = 0
const step = (action: ScheduleAction): Step => ({ id: String(stepCounter++), action })

function SortableStep({ step: { id, action }, chat, onChange, onRemove }: { step: Step; chat: boolean; onChange: (next: ScheduleAction) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('relative flex flex-wrap items-center gap-2 rounded-lg bg-foreground/[0.04] py-2 pl-1 pr-2', isDragging && 'z-10 bg-raised shadow-lg shadow-black/30')}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t('appearance.dragToReorder')}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-subtle-foreground hover:bg-field hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <RiDraggable className="size-4" />
      </button>
      <span className="w-28 shrink-0 text-sm font-medium">{t(`schedules.actions.${action.type}`)}</span>
      <div className="min-w-40 flex-1">
        <ActionEditor action={action} chat={chat} onChange={onChange} />
      </div>
      <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={t('schedules.removeStep')} onClick={onRemove}>
        <RiCloseFill />
      </Button>
    </div>
  )
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
  const [steps, setSteps] = useState(() => draft.actions.map(step))
  const [adding, setAdding] = useState<ActionType>('command')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const next = nextCronRun(draft.cron)
  const actions = steps.map((s) => s.action)
  const save = useMutation({
    mutationFn: () => (initial ? api.updateSchedule(server.id, initial.id, { ...draft, actions }) : api.createSchedule(server.id, { ...draft, actions })),
    onSuccess: (data) => {
      client.setQueryData(keys.schedules(server.id), data)
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setSteps((list) => arrayMove(list, list.findIndex((s) => s.id === active.id), list.findIndex((s) => s.id === over.id)))
  }
  const invalid = !draft.name.trim() || !next || !actions.length || actions.some((a) => (a.type === 'command' && !a.command.trim()) || (a.type === 'say' && !a.message.trim()))
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVertical]} onDragEnd={onDragEnd}>
            <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {steps.map((s) => (
                <SortableStep key={s.id} step={s} chat={chat} onChange={(action) => setSteps((list) => list.map((x) => (x.id === s.id ? { ...x, action } : x)))} onRemove={() => setSteps((list) => list.filter((x) => x.id !== s.id))} />
              ))}
            </SortableContext>
          </DndContext>
          <div className="flex gap-2">
            <Select value={adding} onValueChange={(v) => setAdding(v as ActionType)} options={TYPES.map((type) => ({ value: type, label: t(`schedules.actions.${type}`), hint: t(`schedules.hints.${type}`) }))} className="w-56" />
            <Button type="button" disabled={steps.length >= 30} onClick={() => setSteps([...steps, step(blank(adding))])}>
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

const ICONS: Record<ActionType, RemixiconComponentType> = { say: RiChat3Fill, wait: RiTimerFill, command: RiTerminalBoxFill, backup: RiArchiveStackFill, restart: RiRestartFill, stop: RiStopFill, start: RiPlayFill }

function useCronText() {
  const { t } = useTranslation()
  return (cron: string) => {
    if (PRESETS.includes(cron)) return t(`schedules.presets.${PRESETS.indexOf(cron)}`)
    const daily = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron.trim())
    return daily ? t('schedules.daily', { time: `${daily[2]}:${daily[1]!.padStart(2, '0')}` }) : null
  }
}

function relative(iso: string, lang: string) {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const minutes = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60_000))
  if (minutes < 60) return rtf.format(minutes, 'minute')
  if (minutes < 48 * 60) return rtf.format(Math.round(minutes / 60), 'hour')
  return rtf.format(Math.round(minutes / 1440), 'day')
}

function StepChip({ action }: { action: ScheduleAction }) {
  const { t, i18n } = useTranslation()
  const label = useActionLabel()
  const Icon = ICONS[action.type]
  const text =
    action.type === 'say'
      ? action.message
      : action.type === 'command'
        ? action.command
        : action.type === 'wait'
          ? new Intl.NumberFormat(i18n.language, { style: 'unit', unit: action.seconds % 60 ? 'second' : 'minute', unitDisplay: 'short' }).format(action.seconds % 60 ? action.seconds : action.seconds / 60)
          : t(`schedules.actions.${action.type}`)
  return (
    <span title={label(action)} className="inline-flex max-w-64 items-center gap-1.5 rounded-full bg-field px-2.5 py-1 text-xs">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={cn('truncate', action.type === 'command' && 'font-mono')}>{text}</span>
    </span>
  )
}

function ScheduleRow({ server, schedule, onEdit }: { server: Server; schedule: Schedule; onEdit: () => void }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const cronText = useCronText()
  const manage = can(server, 'manage')
  const onData = (data: SchedulesOverview) => client.setQueryData(keys.schedules(server.id), data)
  const onError = (e: Error) => toast.error(errorMessage(e, t))
  const { id, lastRunAt, lastError, nextRunAt, running, ...input } = schedule
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api.updateSchedule(server.id, id, { ...input, enabled }), onSuccess: onData, onError })
  const run = useMutation({ mutationFn: () => api.runSchedule(server.id, id), onSuccess: onData, onError })
  const remove = useMutation({ mutationFn: () => api.deleteSchedule(server.id, id), onSuccess: onData, onError })
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  const when = cronText(schedule.cron)
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-3">
        <Switch checked={schedule.enabled} disabled={!manage || toggle.isPending} onCheckedChange={(on) => toggle.mutate(on)} aria-label={schedule.name} />
        <span className={cn('min-w-0 flex-1 truncate text-sm font-semibold', !schedule.enabled && 'text-muted-foreground')}>{schedule.name}</span>
        {running ? <Badge variant="accent">{t('schedules.running')}</Badge> : null}
        {lastError ? (
          <Tooltip content={lastError}>
            <Badge variant="danger">
              <RiErrorWarningFill />
              {t('schedules.failed')}
            </Badge>
          </Tooltip>
        ) : null}
        <Tooltip content={[nextRunAt ? t('schedules.nextRun', { date: date(nextRunAt) }) : t('schedules.off'), lastRunAt ? t('schedules.lastRun', { date: date(lastRunAt) }) : null].filter(Boolean).join(' · ')}>
          <Badge variant={nextRunAt ? 'accent' : 'neutral'}>{nextRunAt ? relative(nextRunAt, i18n.language) : t('schedules.off')}</Badge>
        </Tooltip>
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
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs sm:pl-12">
        {when ? <span className="text-muted-foreground">{when}</span> : null}
        <span className="font-mono text-subtle-foreground">{schedule.cron}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:pl-12">
        {schedule.actions.map((a, i) => (
          <Fragment key={i}>
            {i ? <RiArrowRightSLine className="size-3.5 text-subtle-foreground" /> : null}
            <StepChip action={a} />
          </Fragment>
        ))}
      </div>
    </Card>
  )
}

export function ServerSchedules({ server, game }: { server: Server; game: GameTemplate }) {
  const { t } = useTranslation()
  const overview = useQuery({ queryKey: keys.schedules(server.id), queryFn: () => api.schedules(server.id), refetchInterval: (q) => (q.state.data?.schedules.some((s) => s.running) ? 3000 : 60_000) })
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
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
      </div>
      {overview.isPending ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : overview.data?.schedules.length ? (
        overview.data.schedules.map((s) => <ScheduleRow key={s.id} server={server} schedule={s} onEdit={() => setEditing(s)} />)
      ) : (
        <EmptyState title={t('schedules.empty')} description={t('schedules.emptyHint')} />
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? <ScheduleDialog key={editing === 'new' ? 'new' : editing.id} server={server} game={game} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      </Dialog>
    </div>
  )
}
