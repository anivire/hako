import { DndContext, type DragEndEvent, KeyboardSensor, type Modifier, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RiDraggable, RiLayoutBottom2Fill, RiLayoutLeft2Fill, RiLayoutRight2Fill, RiLayoutTop2Fill, RiListUnordered, RiPaletteFill } from '@remixicon/react'
import { Card, Segmented, Switch, cn } from '@hako/ui'
import type { ComponentType, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { type NavLabels, type NavPosition, orderServers, useAppearance } from '../lib/appearance'
import { api } from '../lib/api'
import { useText } from '../lib/i18n'
import { keys, useGames } from '../lib/queries'
import { ServerAvatar } from './game-icon'
import { NAV } from '../lib/navigation'

const restrictToVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

function IconTile({ children }: { children: ReactNode }) {
  return <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent [&_svg]:size-4">{children}</span>
}

function SortableRow({ id, icon: Icon, tile, label, checked, disabled, onToggle, className }: { id: string; icon?: ComponentType; tile?: ReactNode; label: ReactNode; checked: boolean; disabled?: boolean; onToggle: (checked: boolean) => void; className?: string }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('relative flex items-center gap-3 rounded-lg bg-surface py-2.5 pl-2 pr-5', isDragging && 'z-10 bg-raised shadow-lg shadow-black/30', className)}>
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
      {tile ?? (
        <IconTile>
          {Icon ? <Icon /> : null}
        </IconTile>
      )}
      <span className={cn('min-w-0 flex-1 truncate text-sm', !checked && 'text-muted-foreground')}>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onToggle} />
    </div>
  )
}

function ToggleRow({ icon, label, hint, checked, onToggle, className }: { icon: ReactNode; label: ReactNode; hint?: ReactNode; checked: boolean; onToggle: (checked: boolean) => void; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 py-2.5 pl-2 pr-5', className)}>
      <span className="size-8 shrink-0" aria-hidden />
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', !checked && 'text-muted-foreground')}>{label}</span>
        {hint ? <span className="block text-[0.8125rem] text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </label>
  )
}

const NAV_POSITIONS = [
  { value: 'left', icon: RiLayoutLeft2Fill },
  { value: 'top', icon: RiLayoutTop2Fill },
  { value: 'bottom', icon: RiLayoutBottom2Fill },
  { value: 'right', icon: RiLayoutRight2Fill },
] as const satisfies { value: NavPosition; icon: unknown }[]

const NAV_LABELS = ['always', 'hover', 'off'] as const satisfies NavLabels[]

export function NavPositionSettings({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  const { navPosition, setNavPosition, navLabels, setNavLabels } = useAppearance()
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t('appearance.navPosition.title')} className={cn('grid gap-2', compact ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4 sm:gap-4')}>
        {NAV_POSITIONS.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={navPosition === value}
            onClick={() => setNavPosition(value)}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl font-medium transition-colors',
              compact ? 'px-1 py-2.5 text-xs' : 'px-3 py-4 text-sm',
              navPosition === value ? 'bg-accent-soft text-accent' : 'bg-surface text-foreground hover:bg-field',
            )}
          >
            <Icon className={compact ? 'size-5' : 'size-6'} />
            {t(`appearance.navPosition.${value}`)}
          </button>
        ))}
      </div>
      {navPosition === 'left' || navPosition === 'right' ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="text-sm">{t('appearance.navLabels.title')}</span>
          <Segmented size="sm" value={navLabels} onChange={setNavLabels} options={NAV_LABELS.map((value) => ({ value, label: t(`appearance.navLabels.${value}`) }))} />
        </div>
      ) : null}
    </div>
  )
}

function ServerOrder() {
  const { t } = useTranslation()
  const text = useText()
  const { serverOrder, setServerOrder, hiddenServers, setHiddenServers } = useAppearance()
  const servers = useQuery({ queryKey: keys.servers, queryFn: api.servers })
  const games = useGames()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const list = orderServers(servers.data ?? [], serverOrder)
  if (!list.length) return null
  const ids = list.map((s) => s.id)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setServerOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }
  return (
    <div className="pb-1 pl-6">
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVertical]} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {list.map((server) => {
            const game = games.data?.find((g) => g.id === server.game)
            return (
              <SortableRow
                key={server.id}
                id={server.id}
                tile={<ServerAvatar game={game} values={server.variables} icon={server.icon} size={32} ring="var(--color-surface)" />}
                label={
                  <>
                    {server.name}
                    <span className="ml-2 text-xs text-muted-foreground">{text(game?.name)}</span>
                  </>
                }
                checked={!hiddenServers.includes(server.id)}
                onToggle={(on) => setHiddenServers(on ? hiddenServers.filter((id) => id !== server.id) : [...hiddenServers, server.id])}
                className="py-1.5"
              />
            )
          })}
        </SortableContext>
      </DndContext>
      <p className="px-2 pt-1 text-xs text-muted-foreground">{t('appearance.serverOrderHint')}</p>
    </div>
  )
}

export function NavigationSettings() {
  const { t } = useTranslation()
  const { hiddenNav, setHiddenNav, navOrder, setNavOrder, serverList, setServerList, appearanceButton, setAppearanceButton } = useAppearance()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const visibleCount = NAV.length - hiddenNav.length
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setNavOrder(arrayMove(navOrder, navOrder.indexOf(active.id as never), navOrder.indexOf(over.id as never)))
  }
  return (
    <Card className="py-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVertical]} onDragEnd={onDragEnd}>
        <SortableContext items={navOrder} strategy={verticalListSortingStrategy}>
          {navOrder.map((key) => {
            const item = NAV.find((n) => n.key === key)!
            const visible = !hiddenNav.includes(key)
            return (
              <SortableRow
                key={key}
                id={key}
                icon={item.icon}
                label={t(`nav.${key}`)}
                checked={visible}
                disabled={visible && visibleCount <= 1}
                onToggle={(on) => setHiddenNav(on ? hiddenNav.filter((k) => k !== key) : [...hiddenNav, key])}
              />
            )
          })}
        </SortableContext>
      </DndContext>
      <ToggleRow icon={<RiListUnordered />} label={t('appearance.serverList')} hint={t('appearance.serverListHint')} checked={serverList} onToggle={setServerList} />
      {serverList ? <ServerOrder /> : null}
      <ToggleRow icon={<RiPaletteFill />} label={t('appearance.title')} hint={t('appearance.appearanceButtonHint')} checked={appearanceButton} onToggle={setAppearanceButton} className="hidden md:flex" />
    </Card>
  )
}
