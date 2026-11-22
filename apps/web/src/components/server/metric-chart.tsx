import { Card, Skeleton, cn } from '@hako/ui'
import { type PointerEvent, type ReactNode, useId, useState } from 'react'

export interface Series {
  label: string
  color: string
  points: number[]
}

const W = 300
const H = 60

function domain(series: Series[], max: number): [number, number] {
  const all = series.flatMap((s) => s.points.map((v) => Math.min(v, max)))
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = Math.max(hi - lo, max * 0.04, 1e-9)
  const pad = span * 0.25
  const bottom = Math.max(0, lo - pad)
  return [bottom, Math.max(bottom + span + pad, Math.min(max, hi + pad))]
}

function line(points: number[], [lo, hi]: [number, number], length: number) {
  const step = W / Math.max(1, length - 1)
  const offset = length - points.length
  const xy = points.map((v, i) => [(offset + i) * step, H - 3 - ((Math.min(v, hi) - lo) / (hi - lo)) * (H - 8)] as const)
  return xy
    .map(([x, y], i) => {
      if (!i) return `M${x.toFixed(2)},${y.toFixed(2)}`
      const [px, py] = xy[i - 1]!
      const mx = (px + x) / 2
      return `C${mx.toFixed(2)},${py.toFixed(2)} ${mx.toFixed(2)},${y.toFixed(2)} ${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function Chart({ series, max, format, length: capacity }: { series: Series[]; max: number; format: (v: number) => string; length: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const gradient = useId().replace(/:/g, '')
  const count = Math.max(0, ...series.map((s) => s.points.length))
  const length = Math.min(capacity, count)
  const offset = length - count
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const index = Math.round(((e.clientX - rect.left) / rect.width) * (length - 1)) - offset
    setHover(index >= 0 && index < count ? index : null)
  }
  const range = domain(series, max)
  const x = hover === null ? 0 : ((offset + hover) / Math.max(1, length - 1)) * 100
  if (count < 2) return <div className="h-16" />
  return (
    <div className="relative h-16 touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.label} id={`${gradient}-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={series.length === 1 ? 0.4 : 0.24} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {series.map((s, i) => {
          const start = ((length - s.points.length) * W) / Math.max(1, length - 1)
          return <path key={s.label} d={`${line(s.points, range, length)} L${W},${H} L${start},${H} Z`} fill={`url(#${gradient}-${i})`} />
        })}
        {series.map((s) => (
          <path key={s.label} d={line(s.points, range, length)} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {hover !== null ? (
        <>
          <span className="pointer-events-none absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${x}%` }} />
          <div
            className={cn('pointer-events-none absolute bottom-full z-10 mb-1 min-w-28 rounded-md bg-raised px-2.5 py-1.5 text-xs shadow-lg', x > 60 ? '-translate-x-[calc(100%-8px)]' : '-translate-x-2')}
            style={{ left: `${x}%` }}
          >
            {series.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-mono tabular-nums">{format(s.points[hover - (count - s.points.length)] ?? 0)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function StatCard({
  title,
  icon,
  value,
  detail,
  series,
  max,
  format,
  length,
  loading,
}: {
  title: string
  icon: ReactNode
  value: string
  detail?: ReactNode
  series?: Series[]
  max?: number
  format?: (v: number) => string
  length?: number
  loading?: boolean
}) {
  const chart = !loading && series && max !== undefined && format && length
  return (
    <Card className="flex min-h-[9.75rem] min-w-0 flex-col justify-between overflow-hidden">
      <div className={cn('flex flex-col gap-0.5 px-4 pt-3.5', !chart && !loading && 'flex-1 pb-3.5')}>
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
          <span className="text-sm">{title}</span>
          <span className="[&_svg]:size-5">{icon}</span>
        </div>
        {loading ? (
          <>
            <Skeleton className="my-1 h-7 w-24" />
            <Skeleton className="my-0.5 h-4 w-32" />
          </>
        ) : (
          <>
            <div className="truncate text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
            <div className={cn('min-h-5 truncate text-[0.8125rem] text-muted-foreground', !chart && 'mt-auto')}>{detail}</div>
          </>
        )}
      </div>
      {loading ? (
        <Skeleton className="mx-4 mb-3 mt-auto h-10 rounded-md" />
      ) : chart ? (
        <Chart series={series} max={max} format={format} length={length} />
      ) : null}
    </Card>
  )
}
