import { type GameTemplate, variableVisible } from '@hako/shared'
import { Tooltip, cn } from '@hako/ui'
import { useText } from '../lib/i18n'

const COLOR = /(?:fill|stroke|stop-color)\s*[=:]\s*["']?(?:url\(|#(?!(?:fff|ffffff|000|000000)\b)[0-9a-f]{3,8})/i

function colored(src: string) {
  const [meta, data = ''] = src.split(',', 2)
  try {
    return COLOR.test(meta!.endsWith(';base64') ? atob(data) : decodeURIComponent(data))
  } catch {
    return false
  }
}

export function GameIcon({ src, fallback, className }: { src?: string; fallback?: string; className?: string }) {
  if (!src) return <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-sm font-semibold uppercase text-muted-foreground', className)}>{fallback?.slice(0, 1)}</span>
  if (src.startsWith('data:image/svg+xml') && !colored(src)) {
    return <span aria-hidden className={cn('block shrink-0 bg-current', className)} style={{ maskImage: `url("${src}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />
  }
  return <img src={src} alt="" className={cn('shrink-0 object-contain', !src.startsWith('data:image/svg+xml') && '[image-rendering:pixelated]', className)} />
}

export function variantOption(game: GameTemplate, values: Record<string, string>) {
  const all = Object.fromEntries(game.variables.map((v) => [v.key, values[v.key] || v.default]))
  for (const v of game.variables) {
    if (!variableVisible(v, all)) continue
    const option = v.options?.find((o) => o.value === all[v.key] && o.icon)
    if (option) return option
  }
  return undefined
}

export function ServerAvatar({ game, values, icon, size = 40, ring = 'var(--color-surface)', className }: { game: GameTemplate | undefined; values: Record<string, string>; icon?: string | null; size?: number; ring?: string; className?: string }) {
  const text = useText()
  const variant = game ? variantOption(game, values) : undefined
  const badge = Math.round(size * 0.44)
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {icon ? <img src={icon} alt="" className="size-full rounded-[22%] bg-field object-cover" /> : <GameIcon src={game?.icon} fallback={text(game?.name)} className="size-full rounded-[22%]" />}
      {variant?.icon ? (
        <Tooltip content={text(variant.label) || variant.value}>
          <span
            className="absolute grid place-items-center rounded-full text-foreground"
            style={{ width: badge + 6, height: badge + 6, right: -badge * 0.22 - 3, bottom: -badge * 0.22 - 3, background: `var(--avatar-ring, ${ring})` }}
          >
            <span className="grid" style={{ width: badge * 0.64, height: badge * 0.64 }}>
              <GameIcon src={variant.icon} className="size-full rounded-[2px]" />
            </span>
          </span>
        </Tooltip>
      ) : null}
    </span>
  )
}
