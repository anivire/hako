import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Field, Input, LogoMark } from '@hako/ui'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { errorMessage, keys, useMe } from '../lib/queries'

function AuthLayout({ title, subtitle, children }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <LogoMark size={64} />
          <span className="text-xl font-semibold tracking-tight">hako</span>
        </div>
        <Card className="p-6">
          {title ? (
            <div className="mb-5">
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
          ) : null}
          {children}
        </Card>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (user) => {
      client.setQueryData(keys.me, user)
      navigate(params.get('next') || '/', { replace: true })
    },
  })
  if (me) return <Navigate to="/" replace />
  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate()
  }
  return (
    <AuthLayout>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('auth.username')} htmlFor="username">
          <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" error={login.error ? errorMessage(login.error, t) : undefined}>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="accent" loading={login.isPending} className="mt-1">
          {t('auth.login')}
        </Button>
      </form>
    </AuthLayout>
  )
}

function InviteForm({ code, role }: { code: string; role: string | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && confirm !== password
  const register = useMutation({
    mutationFn: () => api.register(code, username, password),
    onSuccess: (user) => {
      client.setQueryData(keys.me, user)
      navigate('/', { replace: true })
    },
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (password === confirm) register.mutate()
      }}
      className="flex flex-col gap-4"
    >
      {role === 'admin' ? (
        <Badge variant="accent" className="self-start">
          {t('auth.inviteAdmin')}
        </Badge>
      ) : null}
      <Field label={t('auth.username')} hint={t('auth.usernameHint')} htmlFor="username">
        <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} pattern="[a-zA-Z0-9_.\-]{3,32}" autoFocus required />
      </Field>
      <Field label={t('auth.password')} hint={t('auth.passwordHint')} htmlFor="password" error={register.error ? errorMessage(register.error, t) : undefined}>
        <Input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Field label={t('auth.passwordConfirm')} htmlFor="password-confirm" error={mismatch ? t('auth.passwordMismatch') : undefined}>
        <Input id="password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch || undefined} required />
      </Field>
      <Button type="submit" variant="accent" loading={register.isPending} disabled={mismatch} className="mt-1">
        {t('auth.register')}
      </Button>
    </form>
  )
}

function AcceptInvite({ code, server }: { code: string; server: { id: string; name: string } }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const accept = useMutation({
    mutationFn: () => api.acceptInvite(code),
    onSuccess: ({ serverId }) => {
      void client.invalidateQueries({ queryKey: keys.servers })
      navigate(`/servers/${serverId}`, { replace: true })
    },
  })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('auth.joinServerHint', { name: server.name })}</p>
      {accept.error ? <p className="text-sm text-danger">{errorMessage(accept.error, t)}</p> : null}
      <Button variant="accent" loading={accept.isPending} onClick={() => accept.mutate()}>
        {t('auth.joinServer', { name: server.name })}
      </Button>
    </div>
  )
}

export function InvitePage() {
  const { t } = useTranslation()
  const { code = '' } = useParams()
  const me = useMe()
  const invite = useQuery({ queryKey: ['invite', code], queryFn: () => api.invite(code) })
  const server = invite.data?.server ?? null
  const signedIn = Boolean(me.data)
  return (
    <AuthLayout title={server ? t('auth.serverInviteTitle', { name: server.name }) : t('auth.inviteTitle')} subtitle={server ? t('auth.serverInviteSubtitle') : t('auth.inviteSubtitle')}>
      {invite.isPending || me.isPending ? (
        <div className="h-40" />
      ) : !invite.data?.valid ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('auth.inviteInvalid')}</p>
      ) : server && signedIn ? (
        <AcceptInvite code={code} server={server} />
      ) : (
        <>
          <InviteForm code={code} role={invite.data.role} />
          {server ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t('auth.haveAccount')}{' '}
              <a href={`/login?next=${encodeURIComponent(`/invite/${code}`)}`} className="font-medium text-accent hover:underline">
                {t('auth.login')}
              </a>
            </p>
          ) : null}
        </>
      )}
    </AuthLayout>
  )
}
