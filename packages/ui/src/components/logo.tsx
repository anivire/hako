import type { CSSProperties } from 'react'
import { cn } from '@anivire/kata-ui'

export type MascotMood = 'idle' | 'happy' | 'sleepy' | 'thinking' | 'error'

const BODY = 'var(--logo)'
const INK = 'var(--logo-ink)'
const BOX = 'M17 22H47Q55 22 55 30V49Q55 57 47 57H17Q9 57 9 49V30Q9 22 17 22Z'
const FLAP_LEFT = 'M12 24L5.5 13.5Q4.8 11.6 6.9 11.7L26.5 14.5L28.5 24Z'
const FLAP_RIGHT = 'M52 24L58.5 13.5Q59.2 11.6 57.1 11.7L37.5 14.5L35.5 24Z'
const SEAM = 'M9 30H55'

function twinkle(animated: boolean, delay = 0): CSSProperties | undefined {
  return animated ? { animation: `kata-twinkle 1.8s ease-in-out ${delay}s infinite` } : undefined
}

function Flaps({ droop }: { droop: boolean }) {
  return (
    <g fill={BODY} stroke={BODY} strokeWidth={3} strokeLinejoin="round" opacity={0.78}>
      <path d={FLAP_LEFT} transform={droop ? 'translate(0 4) rotate(-16 20 24)' : undefined} />
      <path d={FLAP_RIGHT} transform={droop ? 'translate(0 4) rotate(16 44 24)' : undefined} />
    </g>
  )
}

function Body() {
  return (
    <>
      <path d={BOX} fill={BODY} />
      <path d={SEAM} stroke={INK} strokeWidth={2} opacity={0.18} />
    </>
  )
}

function PillEyes({ dx = 0, dy = 0, height = 12, blink = false }: { dx?: number; dy?: number; height?: number; blink?: boolean }) {
  const y = 41 - height / 2 + dy
  return (
    <g fill={INK} style={blink ? { transformOrigin: '32px 41px', animation: 'kata-blink 5s infinite' } : undefined}>
      <rect x={20.5 + dx} y={y} width={7} height={height} rx={3.5} />
      <rect x={36.5 + dx} y={y} width={7} height={height} rx={3.5} />
    </g>
  )
}

function Face({ mood, blink }: { mood: MascotMood; blink: boolean }) {
  switch (mood) {
    case 'happy':
      return (
        <g fill="none" stroke={INK} strokeWidth={3.6} strokeLinecap="round">
          <path d="M20 43Q24 36 28 43" />
          <path d="M36 43Q40 36 44 43" />
        </g>
      )
    case 'sleepy':
      return (
        <g fill="none" stroke={INK} strokeWidth={3.6} strokeLinecap="round">
          <path d="M20 40Q24 45 28 40" />
          <path d="M36 40Q40 45 44 40" />
        </g>
      )
    case 'thinking':
      return <PillEyes dx={1.8} dy={-2} height={10} />
    case 'error':
      return (
        <g fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round">
          <path d="M20.5 37.5L27.5 44.5M27.5 37.5L20.5 44.5" />
          <path d="M36.5 37.5L43.5 44.5M43.5 37.5L36.5 44.5" />
        </g>
      )
    default:
      return <PillEyes blink={blink} />
  }
}

function Sparkle({ x, y, r, style }: { x: number; y: number; r: number; style?: CSSProperties }) {
  return <path d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`} fill={BODY} style={style} />
}

function Extras({ mood, animated }: { mood: MascotMood; animated: boolean }) {
  switch (mood) {
    case 'happy':
      return (
        <>
          <Sparkle x={59} y={22} r={4.5} style={twinkle(animated)} />
          <Sparkle x={4.5} y={32} r={3} style={twinkle(animated, 0.9)} />
        </>
      )
    case 'sleepy':
      return (
        <g fill="none" stroke={BODY} strokeLinecap="round" strokeLinejoin="round">
          <path d="M54 1.5H61L54 9H61" strokeWidth={2.6} style={twinkle(animated, 0.6)} />
          <path d="M47.5 8H52L47.5 12.5H52" strokeWidth={2.2} style={twinkle(animated)} />
        </g>
      )
    case 'thinking':
      return (
        <g fill={BODY}>
          <circle cx={56} cy={20} r={1.8} style={twinkle(animated)} />
          <circle cx={58.6} cy={13.6} r={2.4} style={twinkle(animated, 0.3)} />
          <circle cx={60.4} cy={6} r={3.1} style={twinkle(animated, 0.6)} />
        </g>
      )
    default:
      return null
  }
}

export function Mascot({ mood = 'idle', size = 32, className, animated = true }: { mood?: MascotMood; size?: number; className?: string; animated?: boolean }) {
  const droop = mood === 'sleepy' || mood === 'error'
  return (
    <svg
      width={`${size / 16}rem`}
      height={`${size / 16}rem`}
      viewBox="0 0 64 64"
      className={cn('shrink-0 overflow-visible', className)}
      style={animated && mood !== 'sleepy' ? { animation: 'kata-bob 3.2s ease-in-out infinite' } : undefined}
      aria-hidden
    >
      <Flaps droop={droop} />
      <Body />
      <Face mood={mood} blink={animated} />
      <Extras mood={mood} animated={animated} />
    </svg>
  )
}

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={`${size / 16}rem`} height={`${size / 16}rem`} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      <Flaps droop={false} />
      <Body />
      <PillEyes blink />
    </svg>
  )
}

export function logoSvg(body: string, ink: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    `<g fill="${body}" stroke="${body}" stroke-width="3" stroke-linejoin="round" opacity=".78"><path d="${FLAP_LEFT}"/><path d="${FLAP_RIGHT}"/></g>`,
    `<path fill="${body}" d="${BOX}"/>`,
    `<path d="${SEAM}" stroke="${ink}" stroke-width="2" opacity=".18"/>`,
    `<g fill="${ink}"><rect x="20.5" y="35" width="7" height="12" rx="3.5"/><rect x="36.5" y="35" width="7" height="12" rx="3.5"/></g>`,
    '</svg>',
  ].join('')
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <LogoMark size={size} />
      <span className="text-[1.0625rem] font-semibold tracking-tight">hako</span>
    </span>
  )
}
