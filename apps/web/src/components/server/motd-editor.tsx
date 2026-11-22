import { RiBold, RiEraserFill, RiItalic, RiQuestionMark, RiStrikethrough, RiUnderline } from '@remixicon/react'
import { Textarea, Tooltip, cn } from '@hako/ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MOTD_COLORS, type MotdSegment, parseMotd, visibleLength } from '../../lib/motd'

const LINE_LIMIT = 59
const STYLES: { code: string; key: string; icon: ReactNode }[] = [
  { code: 'l', key: 'bold', icon: <RiBold /> },
  { code: 'o', key: 'italic', icon: <RiItalic /> },
  { code: 'n', key: 'underline', icon: <RiUnderline /> },
  { code: 'm', key: 'strike', icon: <RiStrikethrough /> },
  { code: 'k', key: 'obfuscated', icon: <RiQuestionMark /> },
]

function scramble(text: string) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return text.replace(/\S/g, () => chars[Math.floor(Math.random() * chars.length)]!)
}

function Segment({ segment, tick }: { segment: MotdSegment; tick: number }) {
  void tick
  return (
    <span
      style={{
        color: segment.color,
        fontWeight: segment.bold ? 700 : 400,
        fontStyle: segment.italic ? 'italic' : undefined,
        textDecoration: [segment.underline && 'underline', segment.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
        textShadow: `2px 2px 0 color-mix(in srgb, ${segment.color} 25%, black)`,
      }}
    >
      {segment.obfuscated ? scramble(segment.text) : segment.text}
    </span>
  )
}

function Preview({ value, name, players, icon }: { value: string; name: string; players: string; icon?: string }) {
  const lines = parseMotd(value)
  const [tick, setTick] = useState(0)
  const obfuscated = lines.some((line) => line.some((s) => s.obfuscated))
  useEffect(() => {
    if (!obfuscated) return
    const timer = setInterval(() => setTick((n) => n + 1), 80)
    return () => clearInterval(timer)
  }, [obfuscated])
  return (
    <div className="flex items-start gap-3 rounded-lg bg-[#0a0a0b] p-3 font-minecraft text-base leading-[1.15]">
      {icon ? <img src={icon} alt="" className="size-14 shrink-0 rounded object-cover [image-rendering:pixelated]" /> : <div className="size-14 shrink-0 rounded bg-white/10" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-white">{name}</span>
          <span className="shrink-0 text-[#AAAAAA]">{players}</span>
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="min-h-[1.3em] whitespace-pre">
            {(lines[i] ?? []).map((segment, j) => (
              <Segment key={j} segment={segment} tick={tick} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MotdEditor({ id, value, onChange, name, players, icon }: { id: string; value: string; onChange: (value: string) => void; name: string; players: string; icon?: string }) {
  const { t } = useTranslation()
  const area = useRef<HTMLTextAreaElement>(null)
  const insert = (code: string) => {
    const el = area.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const tag = `§${code}`
    const next = start === end ? value.slice(0, start) + tag + value.slice(end) : value.slice(0, start) + tag + value.slice(start, end) + '§r' + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const caret = start === end ? start + tag.length : end + tag.length + 2
      el.setSelectionRange(caret, caret)
    })
  }
  const lines = value.split('\n')
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('motd.colors')}>
          {Object.entries(MOTD_COLORS).map(([code, color]) => (
            <Tooltip key={code} content={`§${code}`}>
              <button type="button" aria-label={`§${code}`} onClick={() => insert(code)} className="size-6 cursor-pointer rounded-md shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)] transition-transform hover:scale-110" style={{ background: color }} />
            </Tooltip>
          ))}
        </div>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {STYLES.map((s) => (
          <Tooltip key={s.code} content={`${t(`motd.${s.key}`)} §${s.code}`}>
            <button type="button" aria-label={t(`motd.${s.key}`)} onClick={() => insert(s.code)} className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4">
              {s.icon}
            </button>
          </Tooltip>
        ))}
        <Tooltip content={`${t('motd.reset')} §r`}>
          <button type="button" aria-label={t('motd.reset')} onClick={() => insert('r')} className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4">
            <RiEraserFill />
          </button>
        </Tooltip>
      </div>
      <Textarea
        id={id}
        ref={area}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value.split('\n').slice(0, 2).join('\n'))}
        spellCheck={false}
        className="min-h-0 resize-none font-mono text-[0.8125rem]"
      />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{t('motd.hint')}</span>
        <span className="font-mono">
          {lines.map((line, i) => (
            <span key={i} className={cn(i ? 'ml-3' : null, visibleLength(line) > LINE_LIMIT && 'text-warning')}>
              {visibleLength(line)}/{LINE_LIMIT}
            </span>
          ))}
        </span>
      </div>
      <Preview value={value} name={name} players={players} icon={icon} />
    </div>
  )
}
