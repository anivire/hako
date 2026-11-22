import { Button, EmptyState, LogoMark } from '@hako/ui'
import { type ComponentType, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, createBrowserRouter, useLocation, useRouteError } from 'react-router'
import { AppShell, Page } from './components/app-shell'
import { setLocale } from './lib/i18n'
import { useMe } from './lib/queries'
import { InvitePage, LoginPage } from './pages/login'
import { ServersPage } from './pages/servers'

const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => async () => ({ Component: (await load())[name] })

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <LogoMark size={48} className="animate-pulse" />
    </div>
  )
}

function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-lg flex-col items-center gap-4 text-center">
        <LogoMark size={56} />
        <p className="break-words font-mono text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </div>
    </div>
  )
}

function RequireAuth() {
  const { data: user, isPending } = useMe()
  const location = useLocation()
  useEffect(() => {
    if (user) void setLocale(user.locale)
  }, [user?.locale])
  if (isPending) return <Splash />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function RequireAdmin() {
  const { data: user } = useMe()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <Page>
      <EmptyState title={t('common.notFound')} />
    </Page>
  )
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    hydrateFallbackElement: <Splash />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/invite/:code', element: <InvitePage /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <ServersPage /> },
          { path: 'settings', lazy: page(() => import('./pages/settings'), 'SettingsPage') },
          { path: 'servers/new', lazy: page(() => import('./pages/new-server'), 'NewServerPage') },
          { path: 'servers/:id', lazy: page(() => import('./pages/server'), 'ServerPage') },
          { element: <RequireAdmin />, children: [{ path: 'admin', lazy: page(() => import('./pages/admin'), 'AdminPage') }] },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
