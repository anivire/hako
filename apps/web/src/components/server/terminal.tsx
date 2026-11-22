import '@xterm/xterm/css/xterm.css'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { type ITheme, Terminal } from '@xterm/xterm'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useAppearance } from '../../lib/appearance'
import { type FilterState, type LogFilter, filterLog, highlight } from '../../lib/log-highlight'
import type { ServerSocket } from '../../lib/server-socket'

const RESET = '\x1bc\x1b[3J'
const FONT = "'JetBrains Mono Variable', ui-monospace, monospace"

const DARK = { black: '#3f3f46', red: '#f87171', green: '#4ade80', yellow: '#facc15', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#d4d4d8', brightBlack: '#71717a', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#fafafa' }

let canvas: CanvasRenderingContext2D | null = null

function hex(variable: string, alpha = 1): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  canvas ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!canvas || !value) return '#000000'
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = value
  canvas.fillRect(0, 0, 1, 1)
  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const CONSOLE_BACKGROUND = '#0a0a0b'

function theme(): ITheme {
  return {
    background: CONSOLE_BACKGROUND,
    foreground: '#e4e4e7',
    cursor: CONSOLE_BACKGROUND,
    cursorAccent: CONSOLE_BACKGROUND,
    selectionBackground: hex('--accent', 0.4),
    scrollbarSliderBackground: 'rgba(255, 255, 255, 0.12)',
    scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.2)',
    scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.28)',
    ...DARK,
  }
}

function fill(terminal: Terminal, addon: FitAddon) {
  const size = addon.proposeDimensions()
  if (!size || !Number.isFinite(size.cols) || !Number.isFinite(size.rows)) return
  if (terminal.cols !== size.cols || terminal.rows !== size.rows + 1) terminal.resize(size.cols, size.rows + 1)
}

export interface TerminalHandle {
  search: (query: string, direction: 'next' | 'previous') => boolean
  clearSearch: () => void
  clear: () => void
  scrollToBottom: () => void
  selection: () => string
  text: () => string
  focus: () => void
}

export const ConsoleTerminal = forwardRef<TerminalHandle, { socket: ServerSocket; fontSize: number; filter: LogFilter; onScrolledUp: (up: boolean) => void; onEmptyChange: (empty: boolean) => void }>(function ConsoleTerminal({ socket, fontSize, filter, onScrolledUp, onEmptyChange }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const search = useRef<SearchAddon | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const { theme: preset, scheme } = useAppearance()
  const filterRef = useRef(filter)
  const filterState = useRef<FilterState>({ pending: '', level: null })
  const written = useRef(false)
  const held = useRef('')
  const print = (terminal: Terminal, text: string) => {
    const full = held.current + text
    const tail = /(\r?\n)+$/.exec(full)?.[0] ?? ''
    held.current = tail
    terminal.write(full.slice(0, full.length - tail.length))
  }
  const empty = useRef(onEmptyChange)
  empty.current = onEmptyChange
  const render = (chunk: string) => {
    const current = filterRef.current
    const out = current === 'all' ? chunk : filterLog(chunk, current, filterState.current)
    if (out && !written.current) written.current = true
    empty.current(current !== 'all' && !written.current)
    return highlight(out)
  }
  const scrolled = useRef(onScrolledUp)
  scrolled.current = onScrolledUp

  useImperativeHandle(ref, () => ({
    search: (query, direction) => {
      const options = { caseSensitive: false, decorations: { matchOverviewRuler: '#888', activeMatchColorOverviewRuler: '#fff', matchBackground: hex('--accent', 0.25), activeMatchBackground: hex('--accent', 0.6) } }
      return direction === 'next' ? (search.current?.findNext(query, options) ?? false) : (search.current?.findPrevious(query, options) ?? false)
    },
    clearSearch: () => search.current?.clearDecorations(),
    clear: () => term.current?.clear(),
    scrollToBottom: () => term.current?.scrollToBottom(),
    selection: () => term.current?.getSelection() ?? '',
    text: () => {
      const buffer = term.current?.buffer.active
      if (!buffer) return ''
      const lines: string[] = []
      for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
      return lines.join('\n').replace(/\n+$/, '\n')
    },
    focus: () => term.current?.focus(),
  }))

  useEffect(() => {
    const el = host.current
    if (!el) return
    let disposed = false
    const terminal = new Terminal({ fontFamily: FONT, fontSize, lineHeight: 1.35, scrollback: 10_000, disableStdin: true, cursorBlink: false, cursorStyle: 'bar', cursorInactiveStyle: 'none', allowProposedApi: true, theme: theme() })
    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(searchAddon)
    terminal.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener')))
    term.current = terminal
    fit.current = fitAddon
    search.current = searchAddon
    let off = () => {}
    const observer = new ResizeObserver(() => {
      try {
        fill(terminal, fitAddon)
      } catch {}
    })
    void document.fonts.load(`12px ${FONT}`).finally(() => {
      if (disposed) return
      terminal.open(el)
      fill(terminal, fitAddon)
      observer.observe(el)
      filterState.current = { pending: '', level: null }
      written.current = false
      held.current = ''
      print(terminal, render(socket.buffer()))
      off = socket.onLog((chunk, reset) => {
        if (reset) {
          filterState.current = { pending: '', level: null }
          written.current = false
        }
        if (reset) held.current = ''
        print(terminal, (reset ? RESET : '') + render(chunk))
      })
      terminal.onScroll(() => {
        const buffer = terminal.buffer.active
        scrolled.current(buffer.viewportY < buffer.baseY)
      })
      terminal.onWriteParsed(() => {
        const buffer = terminal.buffer.active
        scrolled.current(buffer.viewportY < buffer.baseY)
      })
    })
    return () => {
      disposed = true
      off()
      observer.disconnect()
      terminal.dispose()
      term.current = null
    }
  }, [socket.buffer, socket.onLog])

  useEffect(() => {
    if (filterRef.current === filter) return
    filterRef.current = filter
    const terminal = term.current
    if (!terminal) return
    filterState.current = { pending: '', level: null }
    written.current = false
    held.current = ''
    print(terminal, RESET + render(socket.buffer()))
  }, [filter])

  useEffect(() => {
    const terminal = term.current
    if (!terminal) return
    terminal.options.fontSize = fontSize
    try {
      if (fit.current) fill(terminal, fit.current)
    } catch {}
  }, [fontSize])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (term.current) term.current.options.theme = theme()
    })
    return () => cancelAnimationFrame(frame)
  }, [preset, scheme])

  return <div ref={host} className="absolute inset-x-3 inset-y-2 flex flex-col justify-end overflow-hidden [&_.xterm-viewport]:!bg-transparent" />
})
