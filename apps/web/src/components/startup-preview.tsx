import { RiFileCopyFill } from '@remixicon/react'
import { useQuery } from '@tanstack/react-query'
import { type GameTemplate, type Server, startupLine } from '@hako/shared'
import { Button, Segmented, Tooltip, toast } from '@hako/ui'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'

function Token({ token, first }: { token: string; first: boolean }): ReactNode {
  if (first) return <span className="font-semibold text-[#4ade80]">{token}</span>
  const flag = /^(-XX:[+-]?|-D|-X(?:ms|mx|ss)?|--?)([^=]*)(=)?(.*)$/.exec(token)
  if (!flag || !token.startsWith('-')) return <span className="text-[#facc15]">{token}</span>
  const [, prefix, name, eq, value] = flag
  return (
    <span>
      <span className="text-[#71717a]">{prefix}</span>
      <span className="text-[#e4e4e7]">{name}</span>
      {eq ? <span className="text-[#71717a]">=</span> : null}
      {value ? <span className="text-[#60a5fa]">{value}</span> : null}
    </span>
  )
}

function Command({ line }: { line: string }) {
  const tokens = line.split(' ')
  return (
    <code className="block whitespace-pre-wrap break-words font-mono text-[0.8125rem] leading-relaxed">
      {tokens.map((token, i) => (
        <span key={i}>
          {i ? ' ' : null}
          <span className="inline-block max-w-full [overflow-wrap:anywhere]">
            <Token token={token} first={i === 0} />
          </span>
        </span>
      ))}
    </code>
  )
}

export function StartupPreview({ game, values, memory, server }: { game: GameTemplate; values: Record<string, string>; memory: number; server?: Server }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'next' | 'current'>('next')
  const running = Boolean(server && server.status !== 'offline')
  const process = useQuery({ queryKey: ['process', server?.id, server?.startedAt], queryFn: () => api.process(server!.id), enabled: running && mode === 'current', staleTime: 60_000 })
  const preview = startupLine(game, values, memory)
  if (!preview) return null
  const shown = mode === 'current' && running ? (process.data?.command ?? null) : preview
  const copy = async () => {
    if (!shown) return
    await navigator.clipboard.writeText(shown)
    toast.success(t('startup.copied'))
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[0.8125rem] font-medium">{t('startup.title')}</div>
          <div className="text-xs text-muted-foreground">{t('startup.hint')}</div>
        </div>
        {running ? (
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'next', label: t('startup.next') },
              { value: 'current', label: t('startup.current') },
            ]}
          />
        ) : null}
      </div>
      <div className="relative rounded-xl bg-[#0a0a0b] py-3.5 pl-4 pr-12">
        {shown ? <Command line={shown} /> : <span className="text-[0.8125rem] text-white/45">{process.isPending ? t('startup.loading') : t('startup.unavailable')}</span>}
        <Tooltip content={t('startup.copy')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('startup.copy')} onClick={() => void copy()} disabled={!shown} className="absolute right-2 top-2 text-white/60 hover:bg-white/10 hover:text-white">
            <RiFileCopyFill />
          </Button>
        </Tooltip>
      </div>
    </section>
  )
}
