import { RiComputerFill, RiLockFill, RiLogoutBoxRFill, RiPaletteFill, RiSmartphoneFill, RiUser3Fill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionInfo } from '@hako/shared'
import { Badge, Button, Card, Field, Input, Segmented, Skeleton, Tooltip, toast } from '@hako/ui'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { PageWidthSlider } from '../components/appearance-panel'
import { NavPositionSettings, NavigationSettings } from '../components/layout-settings'
import { Page, PageHeader } from '../components/app-shell'
import { Flag, LANGUAGES, useChangeLanguage, useLocale } from '../components/language'
import { SchemePicker, ThemePicker } from '../components/theme-picker'
import { api } from '../lib/api'
import { errorMessage, keys, useUser } from '../lib/queries'

function Block({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const BROWSERS: [RegExp, string][] = [
  [/YaBrowser\//, 'Yandex Browser'],
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Vivaldi\//, 'Vivaldi'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

function deviceName(ua: string | null) {
  if (!ua) return null
  return [BROWSERS.find(([re]) => re.test(ua))?.[1], SYSTEMS.find(([re]) => re.test(ua))?.[1]].filter(Boolean).join(' · ') || null
}

function SessionRow({ session, onRevoke, pending }: { session: SessionInfo; onRevoke: () => void; pending: boolean }) {
  const { t, i18n } = useTranslation()
  const Icon = session.userAgent && /Mobi|iPhone|iPad|Android/.test(session.userAgent) ? RiSmartphoneFill : RiComputerFill
  const label = session.current ? t('account.signOut') : t('account.revoke')
  const meta = [session.ip, t('account.signedIn', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.createdAt)) })].filter(Boolean)
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-field text-muted-foreground [&_svg]:size-5">
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{deviceName(session.userAgent) ?? t('account.unknownDevice')}</span>
          {session.current ? <Badge variant="success">{t('account.current')}</Badge> : null}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta.join(' · ')}</div>
      </div>
      <Tooltip content={label}>
        <Button variant="ghost" size={session.current ? 'sm' : 'icon-sm'} loading={pending} onClick={onRevoke} aria-label={label} className="shrink-0 hover:bg-danger-soft hover:text-danger">
          <RiLogoutBoxRFill />
          {session.current ? label : null}
        </Button>
      </Tooltip>
    </div>
  )
}

function Sessions() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const navigate = useNavigate()
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions })
  const revoke = useMutation({
    mutationFn: api.revokeSession,
    onSuccess: (r) => {
      if (r.signedOut) {
        client.setQueryData(keys.me, null)
        client.clear()
        navigate('/login')
        return
      }
      toast.success(t('account.revoked'))
      void client.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const revokeOthers = useMutation({
    mutationFn: api.revokeOtherSessions,
    onSuccess: () => {
      toast.success(t('account.othersRevoked'))
      void client.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const list = sessions.data ?? []
  return (
    <Card className="flex flex-col gap-1 p-1.5">
      {sessions.isPending
        ? [0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))
        : list.map((s) => <SessionRow key={s.id} session={s} pending={revoke.isPending && revoke.variables === s.id} onRevoke={() => revoke.mutate(s.id)} />)}
      {list.length > 1 ? (
        <div className="flex justify-end px-1.5 pb-1 pt-1">
          <Button variant="danger" size="sm" loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
            <RiLogoutBoxRFill />
            {t('account.revokeOthers')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

function AccountTab() {
  const { t, i18n } = useTranslation()
  const user = useUser()
  const client = useQueryClient()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const password = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      toast.success(t('account.passwordChanged'))
      void client.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
  const rows: [string, ReactNode][] = [
    [t('account.role'), user.role === 'admin' ? t('nav.roleAdmin') : t('nav.roleUser')],
    [t('account.id'), <span className="font-mono">#{user.id}</span>],
    [t('account.createdAt'), new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(user.createdAt))],
  ]
  return (
    <div className="flex flex-col gap-10">
      <Block title={t('account.info')}>
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.8125rem] font-medium">{t('account.username')}</span>
            <div className="flex h-9 cursor-default select-text items-center gap-2 rounded-lg bg-field px-3 text-sm font-medium">
              <RiLockFill className="size-4 shrink-0 text-subtle-foreground" />
              {user.username}
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </Block>
      <Block title={t('account.sessions')} description={t('account.sessionsHint')}>
        <Sessions />
      </Block>
      <Block title={t('account.password')} description={t('account.passwordHint')}>
        <Card className="p-4">
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              password.mutate()
            }}
          >
            <Field label={t('account.currentPassword')} error={password.error ? errorMessage(password.error, t) : undefined}>
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label={t('account.newPassword')}>
              <Input type="password" autoComplete="new-password" minLength={8} placeholder={t('account.newPasswordPlaceholder')} value={next} onChange={(e) => setNext(e.target.value)} required />
            </Field>
            <Button type="submit" variant="secondary" loading={password.isPending} className="sm:mt-[1.625rem]">
              {t('account.changePassword')}
            </Button>
          </form>
        </Card>
      </Block>
    </div>
  )
}

const TABS = ['appearance', 'account'] as const
type Tab = (typeof TABS)[number]
const TAB_ICONS = { appearance: RiPaletteFill, account: RiUser3Fill } satisfies Record<Tab, unknown>

function AppearanceTab() {
  const { t } = useTranslation()
  const locale = useLocale()
  const changeLanguage = useChangeLanguage()
  return (
      <div className="flex flex-col gap-10">
        <Block title={t('nav.language')}>
          <Segmented value={locale} onChange={changeLanguage} options={LANGUAGES.map((l) => ({ ...l, icon: <Flag locale={l.value} /> }))} />
        </Block>
        <Block title={t('appearance.layout')} className="hidden md:block">
          <Card className="py-1">
            <div className="flex flex-col gap-3 px-5 py-4">
              <span>
                <span className="block text-sm">{t('appearance.pageWidth')}</span>
                <span className="block text-[0.8125rem] text-muted-foreground">{t('appearance.pageWidthHint')}</span>
              </span>
              <PageWidthSlider />
            </div>
          </Card>
        </Block>
        <Block title={t('appearance.navPosition.title')} className="hidden md:block">
          <NavPositionSettings />
        </Block>
        <Block title={t('appearance.navigation')} description={t('appearance.navigationHint')}>
          <NavigationSettings />
        </Block>
        <Block title={t('appearance.scheme')}>
          <SchemePicker />
        </Block>
        <Block title={t('appearance.theme')}>
          <ThemePicker />
        </Block>
      </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'appearance'
  return (
    <Page>
      <PageHeader title={t('nav.settings')} />
      <Segmented
        value={tab}
        onChange={(v) => setParams(v === 'appearance' ? {} : { tab: v }, { replace: true })}
        options={TABS.map((v) => {
          const Icon = TAB_ICONS[v]
          return { value: v, label: t(`account.tabs.${v}`), icon: <Icon /> }
        })}
        className="mb-6"
      />
      <div key={tab} className="animate-fade">
        {tab === 'appearance' ? <AppearanceTab /> : <AccountTab />}
      </div>
    </Page>
  )
}
