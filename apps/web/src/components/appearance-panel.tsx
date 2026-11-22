import { RiArrowRightSLine } from '@remixicon/react'
import { Popover, PopoverContent, PopoverTrigger, StepSlider, cn } from '@hako/ui'
import { type ReactElement, type ReactNode, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { TLink } from './transition-link'
import { useAppearance } from '../lib/appearance'
import { NavPositionSettings } from './layout-settings'
import { SchemePicker, ThemePicker } from './theme-picker'

function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

export function PageWidthSlider() {
  const { t } = useTranslation()
  const { pageWidth, setPageWidth, pageWidthOptions } = useAppearance()
  return <StepSlider value={pageWidth} onChange={setPageWidth} label={t('appearance.pageWidth')} options={pageWidthOptions.map((w) => ({ value: w.value, label: w.label }))} />
}

let popoverOpen = false
const openListeners = new Set<() => void>()

function setOpen(open: boolean) {
  popoverOpen = open
  for (const listener of openListeners) listener()
}

function usePopoverOpen() {
  return useSyncExternalStore(
    (listener) => {
      openListeners.add(listener)
      return () => openListeners.delete(listener)
    },
    () => popoverOpen,
  )
}

export function AppearancePopover({ trigger, side = 'bottom' }: { trigger: ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const { t } = useTranslation()
  const open = usePopoverOpen()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side={side} align="end" collisionPadding={12} className="flex max-h-[min(85vh,40rem)] w-[min(92vw,22rem)] flex-col overflow-hidden p-0">
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-4">
          <Section title={t('appearance.scheme')}>
            <SchemePicker compact />
          </Section>
          <Section title={t('appearance.theme')}>
            <ThemePicker compact />
          </Section>
          <Section title={t('appearance.navPosition.title')} className="hidden md:block">
            <NavPositionSettings compact />
          </Section>
          <Section title={t('appearance.pageWidth')} className={cn('hidden md:block')}>
            <PageWidthSlider />
          </Section>
          <TLink
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('appearance.allSettings')}
            <RiArrowRightSLine className="size-4" />
          </TLink>
        </div>
      </PopoverContent>
    </Popover>
  )
}
