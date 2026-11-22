import { type ColorScheme, DEFAULT_SCHEME, DEFAULT_THEME, THEME_PRESETS, type ThemePreset, applyTheme, logoSvg } from '@hako/ui'
import { type ReactNode, createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { NAV, type NavKey } from './navigation'
import { readStorage, writeStorage } from './storage'

export const STORAGE_KEY = 'hako:appearance'

export const PAGE_WIDTHS = [
  { value: '5xl', max: '64rem', label: '5XL' },
  { value: '6xl', max: '72rem', label: '6XL' },
  { value: '7xl', max: '80rem', label: '7XL' },
  { value: '8xl', max: '96rem', label: '8XL' },
  { value: '9xl', max: '120rem', label: '9XL' },
  { value: 'full', max: '100vw', label: '100%' },
] as const

export type PageWidth = (typeof PAGE_WIDTHS)[number]['value']

const DEFAULT_WIDTH: PageWidth = 'full'

export type NavPosition = 'left' | 'top' | 'bottom' | 'right'

export type NavLabels = 'always' | 'hover' | 'off'

interface State {
  theme: ThemePreset
  scheme: ColorScheme
  pageWidth: PageWidth
  navPosition: NavPosition
  navLabels: NavLabels
  hiddenNav: NavKey[]
  navOrder: NavKey[]
  serverList: boolean
  serverOrder: string[]
  hiddenServers: string[]
  appearanceButton: boolean
}

interface Appearance extends State {
  pageWidthOptions: (typeof PAGE_WIDTHS)[number][]
  setTheme: (theme: ThemePreset) => void
  setScheme: (scheme: ColorScheme) => void
  setPageWidth: (width: PageWidth) => void
  setNavPosition: (position: NavPosition) => void
  setNavLabels: (labels: NavLabels) => void
  setHiddenNav: (keys: NavKey[]) => void
  setNavOrder: (keys: NavKey[]) => void
  setServerList: (on: boolean) => void
  setServerOrder: (ids: string[]) => void
  setHiddenServers: (ids: string[]) => void
  setAppearanceButton: (on: boolean) => void
}

const NAV_KEYS = NAV.map((n) => n.key)

function navKeys(value: unknown): NavKey[] {
  return Array.isArray(value) ? NAV_KEYS.filter((k) => value.includes(k)) : []
}

function navOrder(value: unknown): NavKey[] {
  const list = Array.isArray(value) ? [...new Set(value)].filter((k): k is NavKey => NAV_KEYS.includes(k)) : []
  return [...list, ...NAV_KEYS.filter((k) => !list.includes(k))]
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && /^[\w-]{1,32}$/.test(v)))] : []
}

const DEFAULTS: State = {
  theme: DEFAULT_THEME,
  scheme: DEFAULT_SCHEME,
  pageWidth: DEFAULT_WIDTH,
  navPosition: 'left',
  navLabels: 'always',
  hiddenNav: [],
  navOrder: [...NAV_KEYS],
  serverList: true,
  serverOrder: [],
  hiddenServers: [],
  appearanceButton: true,
}

const AppearanceContext = createContext<Appearance | null>(null)

function load(): State {
  try {
    const raw = JSON.parse(readStorage(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    const hiddenNav = navKeys(raw.hiddenNav)
    return {
      theme: THEME_PRESETS.some((p) => p.id === raw.theme) ? (raw.theme as ThemePreset) : DEFAULT_THEME,
      scheme: raw.scheme === 'light' || raw.scheme === 'dark' || raw.scheme === 'system' ? raw.scheme : DEFAULT_SCHEME,
      pageWidth: PAGE_WIDTHS.some((w) => w.value === raw.pageWidth) ? (raw.pageWidth as PageWidth) : DEFAULT_WIDTH,
      navPosition: raw.navPosition === 'top' || raw.navPosition === 'bottom' || raw.navPosition === 'right' ? raw.navPosition : 'left',
      navLabels: raw.navLabels === 'hover' || raw.navLabels === 'off' ? raw.navLabels : 'always',
      hiddenNav: hiddenNav.length < NAV_KEYS.length ? hiddenNav : [],
      navOrder: navOrder(raw.navOrder),
      serverList: raw.serverList !== false,
      serverOrder: ids(raw.serverOrder),
      hiddenServers: ids(raw.hiddenServers),
      appearanceButton: raw.appearanceButton !== false,
    }
  } catch {
    return DEFAULTS
  }
}

function subscribeWidth(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

function viewportSnapshot() {
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return `${window.innerWidth}|${rem}`
}

function resolveColor(variable: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${variable})`
  probe.style.display = 'none'
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

function updateFavicon() {
  const body = resolveColor('--logo')
  const ink = resolveColor('--logo-ink')
  if (!body || !ink) return
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.append(link)
  }
  link.type = 'image/svg+xml'
  link.href = `data:image/svg+xml,${encodeURIComponent(logoSvg(body, ink))}`
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load)
  const [width, rem] = useSyncExternalStore(subscribeWidth, viewportSnapshot).split('|').map(Number) as [number, number]
  const pageWidthOptions = PAGE_WIDTHS.filter((w) => w.value === 'full' || Number.parseFloat(w.max) * rem <= width)
  const pageWidth = pageWidthOptions.some((w) => w.value === state.pageWidth) ? state.pageWidth : 'full'

  useEffect(() => {
    applyTheme(state.theme, state.scheme)
    updateFavicon()
    writeStorage(STORAGE_KEY, JSON.stringify(state))
    if (state.scheme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyTheme(state.theme, state.scheme)
      updateFavicon()
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [state])

  useEffect(() => {
    document.documentElement.style.setProperty('--page-max-setting', PAGE_WIDTHS.find((w) => w.value === pageWidth)!.max)
  }, [pageWidth])

  return (
    <AppearanceContext
      value={{
        ...state,
        pageWidth,
        pageWidthOptions,
        setTheme: (theme) => setState((s) => ({ ...s, theme })),
        setScheme: (scheme) => setState((s) => ({ ...s, scheme })),
        setPageWidth: (pageWidth) => setState((s) => ({ ...s, pageWidth })),
        setNavPosition: (navPosition) => setState((s) => ({ ...s, navPosition })),
        setNavLabels: (navLabels) => setState((s) => ({ ...s, navLabels })),
        setHiddenNav: (keys) => setState((s) => ({ ...s, hiddenNav: navKeys(keys).length < NAV_KEYS.length ? navKeys(keys) : s.hiddenNav })),
        setNavOrder: (keys) => setState((s) => ({ ...s, navOrder: navOrder(keys) })),
        setServerList: (serverList) => setState((s) => ({ ...s, serverList })),
        setServerOrder: (serverOrder) => setState((s) => ({ ...s, serverOrder: ids(serverOrder) })),
        setHiddenServers: (hiddenServers) => setState((s) => ({ ...s, hiddenServers: ids(hiddenServers) })),
        setAppearanceButton: (appearanceButton) => setState((s) => ({ ...s, appearanceButton })),
      }}
    >
      {children}
    </AppearanceContext>
  )
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext)
  if (!ctx) throw new Error('useAppearance outside provider')
  return ctx
}

export { orderServers } from './order'
