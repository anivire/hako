import { StepSlider } from '@hako/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const PRESETS = [512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 24576, 32768]

export function sizeLabel(mb: number) {
  return mb >= 1024 ? `${Number((mb / 1024).toFixed(1))} GB` : `${mb} MB`
}

export function MemoryPicker({ value, min, max, onChange, id }: { value: number; min: number; max?: number | null; onChange: (mb: number) => void; id?: string }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)
  const top = max && max >= min ? max : Infinity
  const steps = [...new Set([Math.min(min, top), ...PRESETS.filter((m) => m > min && m < top), ...(Number.isFinite(top) ? [top] : [])])].sort((a, b) => a - b)
  const nearest = steps.reduce((best, m) => (Math.abs(m - value) < Math.abs(best - value) ? m : best), steps[0]!)
  const commit = (raw: string) => {
    const mb = Math.round(Number(raw))
    setDraft(null)
    if (Number.isFinite(mb) && mb > 0) onChange(Math.min(top, Math.max(min, mb)))
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <StepSlider value={String(nearest)} onChange={(next) => onChange(Number(next))} label={t('servers.memoryPick')} options={steps.map((m) => ({ value: String(m), label: sizeLabel(m) }))} className="min-w-64 flex-1" />
      <label className="flex h-9 w-36 shrink-0 items-center gap-2 rounded-lg bg-field px-3 focus-within:bg-field-hover">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={Number.isFinite(top) ? top : undefined}
          step={256}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(e.currentTarget.value)
            }
          }}
          aria-label={t('servers.memory')}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-xs text-muted-foreground">{t('servers.mb')}</span>
      </label>
    </div>
  )
}
