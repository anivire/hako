import { RiArrowDownSLine, RiLogoutBoxRFill, RiMenuFill, RiPaletteFill, RiSettings3Fill, RiShieldFill, RiUser3Fill } from '@remixicon/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ServerStatus, User } from '@hako/shared'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Logo, LogoMark, Tooltip, cn, useSlidingIndicator } from '@hako/ui'
import { Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { matchPath, useLocation, useNavigate } from 'react-router'
import { TLink, TNavLink } from './transition-link'
import { api } from '../lib/api'
import { orderServers, useAppearance } from '../lib/appearance'
import { useText } from '../lib/i18n'
import { NAV } from '../lib/navigation'
import { keys, useGames, useUser } from '../lib/queries'
import { readStorage, writeStorage } from '../lib/storage'
import { AppearancePopover } from './appearance-panel'
import { GameIcon } from './game-icon'
import { RailLabel, RailProvider, RailTip, useRail, useRailButton } from './rail'

type Side = 'top' | 'bottom' | 'left' | 'right'

const DESKTOP = '(min-width: 48rem)'

function useDesktop() {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(DESKTOP)
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    },
    () => window.matchMedia(DESKTOP).matches,
  )
}

const NAV_ITEM =
  'relative flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent [&_svg]:size-[1.125rem] [&_svg]:shrink-0'

function useVisibleNav() {
  const { hiddenNav, navOrder } = useAppearance()
  return navOrder.map((key) => NAV.find((n) => n.key === key)!).filter((n) => !hiddenNav.includes(n.key))
}

function UserAvatar({ user, className }: { user: User; className?: string }) {
  return <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-foreground', className)}>{user.username.slice(0, 1)}</span>
}

function ProfileLabel() {
  const { t } = useTranslation()
  const user = useUser()
  return (
    <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2">
      <UserAvatar user={user} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{user.username}</span>
        <span className="block text-xs font-normal text-muted-foreground">{user.role === 'admin' ? t('nav.roleAdmin') : t('nav.roleUser')}</span>
      </span>
    </DropdownMenuLabel>
  )
}

function AccountItems() {
  const { t } = useTranslation()
  const user = useUser()
  const navigate = useNavigate()
  const client = useQueryClient()
  const logout = async () => {
    await api.logout()
    client.setQueryData(keys.me, null)
    client.clear()
    navigate('/login')
  }
  return (
    <>
      {user.role === 'admin' ? (
        <DropdownMenuItem asChild>
          <TLink to="/admin">
            <RiShieldFill />
            {t('nav.admin')}
          </TLink>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={logout} className="text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger">
        <RiLogoutBoxRFill />
        {t('nav.logout')}
      </DropdownMenuItem>
    </>
  )
}

function UserMenu({ side = 'bottom', rail = false }: { side?: Side; rail?: boolean }) {
  const { t } = useTranslation()
  const user = useUser()
  const railButton = useRailButton()
  const trigger = (
    <DropdownMenuTrigger asChild>
      {rail ? (
        <button type="button" aria-label={t('nav.account')} className={railButton}>
          <RiUser3Fill />
          <RailLabel>{user.username}</RailLabel>
        </button>
      ) : (
        <Button variant="secondary" size="icon" aria-label={t('nav.account')} className="overflow-hidden rounded-full">
          <span className="text-[0.8125rem] font-semibold uppercase">{user.username.slice(0, 1)}</span>
        </Button>
      )}
    </DropdownMenuTrigger>
  )
  return (
    <DropdownMenu>
      {rail ? (
        <RailTip label={t('nav.account')} side={side}>
          {trigger}
        </RailTip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side={side} className="w-60">
        <ProfileLabel />
        <AccountItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppearanceButton({ rail = false, side = 'bottom' }: { rail?: boolean; side?: Side }) {
  const { t } = useTranslation()
  const railButton = useRailButton()
  const trigger = rail ? (
    <button type="button" aria-label={t('appearance.title')} className={railButton}>
      <RiPaletteFill />
      <RailLabel>{t('appearance.title')}</RailLabel>
    </button>
  ) : (
    <Button variant="secondary" size="icon" aria-label={t('appearance.title')} className="rounded-full">
      <RiPaletteFill />
    </Button>
  )
  return <AppearancePopover trigger={trigger} side={side} />
}

function SettingsButton({ rail = false, side = 'bottom' }: { rail?: boolean; side?: Side }) {
  const { t } = useTranslation()
  const active = Boolean(matchPath({ path: '/settings', end: false }, useLocation().pathname))
  const railButton = useRailButton()
  if (!rail) {
    return (
      <Tooltip content={t('nav.settings')} side={side}>
        <Button asChild variant="secondary" size="icon" className={cn('rounded-full', active && 'text-accent')}>
          <TLink to="/settings" aria-label={t('nav.settings')}>
            <RiSettings3Fill />
          </TLink>
        </Button>
      </Tooltip>
    )
  }
  return (
    <RailTip label={t('nav.settings')} side={side}>
      <TLink to="/settings" aria-label={t('nav.settings')} className={cn(railButton, active && 'bg-muted text-foreground [&_svg]:text-accent')}>
        <RiSettings3Fill />
        <RailLabel>{t('nav.settings')}</RailLabel>
      </TLink>
    </RailTip>
  )
}

const TREE_KEY = 'hako:rail-servers'

function TreeToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={open ? t('nav.collapse') : t('nav.expand')}
      aria-expanded={open}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground [&_svg]:size-4!"
    >
      <RiArrowDownSLine className={cn('transition-transform', !open && '-rotate-90')} />
    </span>
  )
}

const DOT_COLOR: Record<ServerStatus, string> = { running: 'bg-success', starting: 'bg-warning', stopping: 'bg-warning', offline: 'bg-subtle-foreground' }

function ServerTree({ side }: { side: Side }) {
  const servers = useQuery({ queryKey: keys.servers, queryFn: api.servers, refetchInterval: 10_000 })
  const games = useGames()
  const text = useText()
  const { t } = useTranslation()
  const { expanded } = useRail()
  const railButton = useRailButton()
  const { pathname } = useLocation()
  const { serverOrder, hiddenServers } = useAppearance()
  const list = orderServers(servers.data ?? [], serverOrder, hiddenServers)
  if (!list.length) return null
  return (
    <>
      {expanded ? null : <span aria-hidden className="mx-auto my-1.5 h-px w-6 shrink-0 bg-border" />}
      {list.map((s) => {
        const game = games.data?.find((g) => g.id === s.game)
        const busy = s.status === 'starting' || s.status === 'stopping'
        const size = expanded ? 'size-[18px] rounded-[5px]' : 'size-7 rounded-lg'
        const active = pathname.startsWith(`/servers/${s.id}`)
        return (
          <RailTip key={s.id} label={`${s.name} · ${t(`status.${s.status}`)}`} side={side}>
            <TNavLink
              data-rail-item
              to={`/servers/${s.id}`}
              aria-label={s.name}
              className={cn(
                expanded ? cn(railButton, 'h-10 pl-[1.375rem] text-[0.8125rem]') : 'relative grid size-11 shrink-0 place-items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent',
                '[--dot-ring:var(--color-background)]',
                active && 'text-foreground [--dot-ring:var(--color-muted)]',
                !expanded && !active && 'opacity-80 transition-opacity hover:opacity-100',
              )}
            >
              <span className={cn('relative grid shrink-0 place-items-center', expanded ? 'size-5' : 'size-7')}>
                {s.icon ? <img src={s.icon} alt="" className={cn(size, 'object-cover')} /> : <GameIcon src={game?.icon} fallback={text(game?.name) || s.name} className={size} />}
                <span
                  aria-hidden
                  className={cn(
                    'absolute rounded-full ring-2 ring-(--dot-ring) transition-[box-shadow] duration-300',
                    expanded ? '-bottom-0.5 -right-0.5 size-2' : '-bottom-[3px] -right-[3px] size-2.5',
                    DOT_COLOR[s.status],
                    busy && 'animate-pulse',
                  )}
                />
              </span>
              <RailLabel>{s.name}</RailLabel>
            </TNavLink>
          </RailTip>
        )
      })}
    </>
  )
}

function SideRail({ position }: { position: 'left' | 'right' }) {
  const { navLabels } = useAppearance()
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const expanded = navLabels === 'always' || (navLabels === 'hover' && hovered)
  useEffect(() => {
    if (!hovered) return
    const onMove = (e: PointerEvent) => {
      if (ref.current?.querySelector('[data-state="open"]')) return
      const r = ref.current?.getBoundingClientRect()
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setHovered(false)
    }
    const onLeaveWindow = () => {
      if (!ref.current?.querySelector('[data-state="open"]')) setHovered(false)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeaveWindow)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeaveWindow)
    }
  }, [hovered])
  return (
    <RailProvider value={{ labels: navLabels !== 'off', expanded, fill: true }}>
      <aside
        ref={ref}
        onPointerOver={(e) => {
          if (navLabels === 'hover' && (e.target as Element).closest('a, button')) setHovered(true)
        }}
        className={cn(
          'fixed inset-y-0 z-40 hidden flex-col items-start overflow-x-hidden px-2 py-3 [view-transition-name:site-rail] transition-[width,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:flex',
          position === 'left' ? 'left-0' : 'right-0',
          expanded ? 'w-[11.25rem]' : 'w-[3.75rem]',
          navLabels === 'hover' && expanded && 'bg-background shadow-xl',
        )}
      >
        <SideRailContent position={position} />
      </aside>
    </RailProvider>
  )
}

function SideRailContent({ position }: { position: 'left' | 'right' }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const { hiddenNav, navOrder, serverList, appearanceButton } = useAppearance()
  const { expanded } = useRail()
  const railButton = useRailButton()
  const desktop = useDesktop()
  const nav = useVisibleNav()
  const [treeOpen, setTreeOpen] = useState(() => readStorage(TREE_KEY) !== 'closed')
  const toggleTree = () => {
    setTreeOpen(!treeOpen)
    writeStorage(TREE_KEY, treeOpen ? 'closed' : 'open')
  }
  const showTree = serverList && treeOpen
  const indicator = useSlidingIndicator(ref, '[data-rail-item][aria-current="page"]', `${pathname}|${showTree}|${hiddenNav.join()}|${navOrder.join()}|${position}|${expanded}`)
  const side = position === 'left' ? 'right' : 'left'
  return (
    <>
      <TLink to="/" aria-label="hako" className="grid size-11 shrink-0 place-items-center">
        <LogoMark size={30} />
      </TLink>
      <nav ref={ref} className="relative mt-4 flex min-h-0 w-full flex-col items-start gap-1 overflow-y-auto overflow-x-hidden">
        <span
          aria-hidden
          style={{ ...indicator, left: 0, width: '100%', transitionProperty: indicator.transitionProperty ? 'top, height, opacity' : undefined }}
          className="pointer-events-none absolute rounded-xl bg-muted duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
        {nav.map((n) => {
          const active = Boolean(matchPath({ path: n.to, end: n.end }, pathname))
          return (
            <Fragment key={n.to}>
              <RailTip label={t(`nav.${n.key}`)} side={side}>
                <TNavLink data-rail-item to={n.to} end={n.end} aria-label={t(`nav.${n.key}`)} className={cn(railButton, active && 'text-foreground [&_svg]:text-accent')}>
                  <n.icon />
                  <RailLabel>{t(`nav.${n.key}`)}</RailLabel>
                  {n.key === 'servers' && serverList && expanded ? <TreeToggle open={treeOpen} onToggle={toggleTree} /> : null}
                </TNavLink>
              </RailTip>
              {n.key === 'servers' && showTree ? <ServerTree side={side} /> : null}
            </Fragment>
          )
        })}
      </nav>
      <div className="mt-auto flex w-full shrink-0 flex-col items-start gap-2 pt-2">
        {appearanceButton && desktop ? <AppearanceButton rail side={side} /> : null}
        <SettingsButton rail side={side} />
        <UserMenu rail side={side} />
      </div>
    </>
  )
}

function DesktopNav({ side }: { side: 'top' | 'bottom' }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const { hiddenNav, navOrder, serverList, serverOrder, hiddenServers } = useAppearance()
  const nav = useVisibleNav()
  const text = useText()
  const servers = useQuery({ queryKey: keys.servers, queryFn: api.servers, refetchInterval: 10_000 })
  const games = useGames()
  const list = serverList ? orderServers(servers.data ?? [], serverOrder, hiddenServers) : []
  const indicator = useSlidingIndicator(ref, '[aria-current="page"]', `${pathname}|${hiddenNav.join()}|${navOrder.join()}|${side}|${list.length}`)
  return (
    <div className="relative hidden min-w-0 flex-1 justify-center md:flex">
      <nav ref={ref} className="relative flex items-center gap-1">
        <span aria-hidden style={indicator} className="pointer-events-none absolute rounded-lg bg-muted duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" />
        {nav.map((n) => {
          const active = Boolean(matchPath({ path: n.to, end: n.end }, pathname))
          return (
            <TNavLink key={n.to} to={n.to} end={n.end} className={cn(NAV_ITEM, active ? 'text-foreground [&_svg]:text-accent' : 'text-muted-foreground hover:text-foreground')}>
              <n.icon />
              {t(`nav.${n.key}`)}
            </TNavLink>
          )
        })}
        {list.length ? <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-border" /> : null}
        {list.map((srv) => {
          const game = games.data?.find((g) => g.id === srv.game)
          const busy = srv.status === 'starting' || srv.status === 'stopping'
          return (
            <Tooltip key={srv.id} content={`${srv.name} · ${t(`status.${srv.status}`)}`} side={side === 'top' ? 'bottom' : 'top'}>
              <TNavLink to={`/servers/${srv.id}`} aria-label={srv.name} className="relative grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [--dot-ring:var(--color-background)] aria-[current=page]:[--dot-ring:var(--color-muted)]">
                <span className="relative grid size-6 place-items-center">
                  {srv.icon ? <img src={srv.icon} alt="" className="size-6 rounded-md object-cover" /> : <GameIcon src={game?.icon} fallback={text(game?.name) || srv.name} className="size-6 rounded-md" />}
                  <span aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-(--dot-ring)', DOT_COLOR[srv.status], busy && 'animate-pulse')} />
                </span>
              </TNavLink>
            </Tooltip>
          )
        })}
      </nav>
    </div>
  )
}

function MobileMenu() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const nav = useVisibleNav()
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label={t('nav.menu')} className="rounded-full">
          <RiMenuFill />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[calc(100dvh-5rem)] w-64 overflow-y-auto">
        <ProfileLabel />
        <DropdownMenuLabel className="mt-1">{t('nav.sections')}</DropdownMenuLabel>
        {nav.map(({ to, key, icon: Icon, end }) => {
          const active = Boolean(matchPath({ path: to, end }, pathname))
          return (
            <DropdownMenuItem key={to} asChild className={cn(active && 'bg-accent-soft text-accent data-[highlighted]:bg-accent-soft [&_svg]:text-accent')}>
              <TLink to={to}>
                <Icon />
                {t(`nav.${key}`)}
              </TLink>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuItem asChild>
          <TLink to="/settings">
            <RiSettings3Fill />
            {t('nav.settings')}
          </TLink>
        </DropdownMenuItem>
        <DropdownMenuLabel className="mt-1">{t('nav.account')}</DropdownMenuLabel>
        <AccountItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { navPosition, navLabels, appearanceButton } = useAppearance()
  const desktop = useDesktop()
  const rail = navPosition === 'left' || navPosition === 'right' ? navPosition : null
  const dock = navPosition === 'bottom'
  const side = dock ? 'top' : 'bottom'
  const wide = navLabels === 'always'
  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col',
        rail && 'md:[--page-top:1.125rem]',
        rail && (wide ? 'md:[--page-max:min(var(--page-max-setting),calc(100%-10.15rem))]' : 'md:[--page-max:min(var(--page-max-setting),calc(100%-2.65rem))]'),
        rail === 'left' && (wide ? 'md:[--rail-left:10.15rem]' : 'md:[--rail-left:2.65rem]'),
        rail === 'right' && (wide ? 'md:[--rail-right:10.15rem]' : 'md:[--rail-right:2.65rem]'),
        dock && 'md:pb-20 md:[--page-top:1.5rem]',
      )}
    >
      {rail ? <SideRail position={rail} /> : null}
      <header className={cn('sticky top-0 z-40 [view-transition-name:site-header] bg-background/80 pt-2 backdrop-blur-2xl', rail && 'md:hidden', dock && 'md:fixed md:inset-x-0 md:bottom-0 md:top-auto md:pb-3 md:pt-2')}>
        <div className="page-frame flex h-12 items-center gap-3 px-4 sm:px-6">
          <TLink to="/" className="flex shrink-0 items-center">
            <Logo className="[&>span]:text-[0.9375rem] [&_svg]:size-6" />
          </TLink>
          {rail ? null : <DesktopNav side={side} />}
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {appearanceButton && (!rail || !desktop) ? <AppearanceButton side={side} /> : null}
            <div className={cn('hidden items-center gap-2', !rail && 'md:flex')}>
              <SettingsButton side={side} />
              <UserMenu side={side} />
            </div>
            <div className={cn(!rail && 'md:hidden')}>
              <MobileMenu />
            </div>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('page-frame flex w-full flex-1 flex-col px-4 pb-8 pt-4 sm:px-6 sm:pt-(--page-top,2rem)', className)}>{children}</div>
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-1 text-[0.9375rem] text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
