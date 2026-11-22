import { RiAddFill, RiDeleteBin6Fill, RiExternalLinkLine, RiGroupFill, RiKey2Fill, RiPlugFill, RiRefreshLine, RiSettings3Fill, RiTicket2Fill } from '@remixicon/react'
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminUser, ProviderId, ProviderInfo } from '@hako/shared'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogTrigger, Field, Input, Select, Popover, PopoverClose, PopoverContent, PopoverTrigger, Segmented, Skeleton, Spinner, StatusDot, Tooltip, toast } from '@hako/ui'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Page, PageHeader } from '../components/app-shell'
import { ProviderIcon } from '../components/provider-icon'
import { EMPTY_DRAFT, InviteFields, InviteList, PermissionChips, copyInvite, draftInput } from '../components/invite-list'
import { api } from '../lib/api'
import { errorMessage, keys, useUser } from '../lib/queries'

function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('common.delete')}>
          <RiDeleteBin6Fill />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <p className="text-sm">{label}</p>
        <div className="mt-3 flex justify-end gap-2">
          <PopoverClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.cancel')}
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button size="sm" variant="danger" onClick={onConfirm}>
              {t('common.delete')}
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Invites() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const invites = useQuery({ queryKey: keys.invites, queryFn: api.invites })
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const create = useMutation({
    mutationFn: () => api.createInvite({ role, ...draftInput(draft) }),
    onSuccess: ({ code, invites: list }) => {
      client.setQueryData(keys.invites, list)
      setDraft(EMPTY_DRAFT)
      copyInvite(code, t('admin.createdCopied'))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const remove = useMutation({ mutationFn: api.deleteInvite, onSuccess: (list) => client.setQueryData(keys.invites, list) })
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('admin.invites')}</CardTitle>
          <CardDescription>{t('admin.invitesHint')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_9rem_10rem_11rem_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <InviteFields draft={draft} onChange={setDraft} />
          <Field label={t('admin.role')}>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as 'user' | 'admin')}
              options={[
                { value: 'user', label: t('admin.roleUser') },
                { value: 'admin', label: t('admin.roleAdmin') },
              ]}
            />
          </Field>
          <Button type="submit" variant="accent" loading={create.isPending}>
            <RiAddFill />
            {t('admin.createInvite')}
          </Button>
        </form>
        <InviteList
          invites={invites.data}
          loading={invites.isPending}
          onDelete={(id) => remove.mutate(id)}
          extra={(invite) =>
            invite.serverId ? (
              <>
                {t('admin.forServer', { name: invite.serverName ?? invite.serverId })} (<PermissionChips permissions={invite.permissions ?? []} />)
              </>
            ) : invite.role === 'admin' ? (
              t('admin.roleAdmin')
            ) : null
          }
        />
      </CardContent>
    </Card>
  )
}

function UserRow({ user, me, onChange }: { user: AdminUser; me: boolean; onChange: (list: AdminUser[]) => void }) {
  const { t, i18n } = useTranslation()
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })
  const role = useMutation({ mutationFn: (next: 'admin' | 'user') => api.setUserRole(user.id, next), onSuccess: onChange, onError: (e) => toast.error(errorMessage(e, t)) })
  const remove = useMutation({ mutationFn: () => api.deleteUser(user.id), onSuccess: onChange, onError: (e) => toast.error(errorMessage(e, t)) })
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-foreground">
        {user.username.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{user.username}</span>
          {me ? (
            <Badge size="sm" variant="neutral">
              {t('admin.you')}
            </Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {t('admin.joinedOn', { date: date.format(new Date(user.createdAt)) })} · {t('admin.serversCount', { count: user.servers })} · {t('admin.membershipsCount', { count: user.memberships })}
        </div>
      </div>
      {me ? (
        <Badge variant="accent">{t('admin.roleAdmin')}</Badge>
      ) : (
        <Segmented
          size="sm"
          value={user.role}
          onChange={(next) => role.mutate(next)}
          options={[
            { value: 'user', label: t('admin.roleUser') },
            { value: 'admin', label: t('admin.roleAdmin') },
          ]}
        />
      )}
      {me ? <span className="size-8" /> : <ConfirmDelete label={t('admin.confirmDeleteUser', { name: user.username })} onConfirm={() => remove.mutate()} />}
    </div>
  )
}

function Users() {
  const { t } = useTranslation()
  const me = useUser()
  const client = useQueryClient()
  const users = useQuery({ queryKey: keys.users, queryFn: api.users })
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('admin.users')}</CardTitle>
          <CardDescription>{t('admin.usersHint')}</CardDescription>
        </div>
      </CardHeader>
      <div className="flex flex-col pb-2">
        {users.isPending
          ? [0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))
          : users.data?.map((u) => <UserRow key={u.id} user={u} me={u.id === me.id} onChange={(list) => client.setQueryData(keys.users, list)} />)}
      </div>
    </Card>
  )
}

const statusKey = (id: ProviderId) => ['admin', 'providers', id, 'status']

function ProviderStatus({ info }: { info: ProviderInfo }) {
  const { t } = useTranslation()
  const missingKey = info.needsKey && !info.keySource
  const status = useQuery({ queryKey: statusKey(info.id), queryFn: () => api.providerStatus(info.id), staleTime: 60_000, enabled: !missingKey })
  if (missingKey) return <Badge variant="warning">{t('admin.providers.noKey')}</Badge>
  if (status.isFetching || status.isPending)
    return (
      <Badge variant="neutral">
        <Spinner />
        {t('admin.providers.checking')}
      </Badge>
    )
  const ok = status.data?.reachable ?? false
  return (
    <Tooltip content={t('admin.providers.recheck')}>
      <button type="button" className="cursor-pointer rounded-full" onClick={() => void status.refetch()}>
        <Badge variant={ok ? 'success' : 'danger'}>
          <StatusDot tone={ok ? 'success' : 'danger'} pulse={!ok} />
          {ok ? t('admin.providers.reachable') : t('admin.providers.unreachable')}
        </Badge>
      </button>
    </Tooltip>
  )
}

function CurseforgeKey({ info, onChange }: { info: ProviderInfo; onChange: (list: ProviderInfo[]) => void }) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const save = useMutation({
    mutationFn: (value: string | null) => api.setCurseforgeKey(value),
    onSuccess: (list) => {
      setKey('')
      onChange(list)
      toast.success(t('admin.providers.saved'))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (key.trim()) save.mutate(key.trim())
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={info.keySource ? t('admin.providers.keySet', { source: t(`admin.providers.source.${info.keySource}`) }) : t('admin.providers.keyPlaceholder')} autoComplete="off" />
        <Button type="submit" variant="secondary" disabled={!key.trim()} loading={save.isPending && save.variables !== null}>
          <RiKey2Fill />
          {t('common.save')}
        </Button>
        {info.keySource === 'settings' ? (
          <Button type="button" variant="ghost" loading={save.isPending && save.variables === null} onClick={() => save.mutate(null)}>
            {t('admin.providers.clear')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t('admin.providers.curseforgeHint')}</p>
    </form>
  )
}

function ProviderRow({ info, onChange }: { info: ProviderInfo; onChange: (list: ProviderInfo[]) => void }) {
  const { t } = useTranslation()
  const name = t(`admin.providers.names.${info.id}`)
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2">
      <ProviderIcon id={info.id} />
      <span className="min-w-0 flex-1">
        <a href={info.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm font-medium hover:text-accent">
          <span className="truncate">{name}</span>
          <RiExternalLinkLine className="size-3.5 shrink-0 text-subtle-foreground" />
        </a>
        <span className="mt-0.5 flex h-5 min-w-0 items-center gap-2 overflow-hidden">
          <ProviderStatus info={info} />
          <span className="hidden min-w-0 truncate text-xs text-subtle-foreground sm:block">{t(`admin.providers.about.${info.id}`)}</span>
        </span>
      </span>
      {info.needsKey ? (
        <Dialog>
          <Tooltip content={t('admin.providers.settings')}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('admin.providers.settings')}>
                <RiSettings3Fill />
              </Button>
            </DialogTrigger>
          </Tooltip>
          <DialogContent
            title={
              <span className="flex items-center gap-3">
                <ProviderIcon id={info.id} />
                <span className="flex min-w-0 flex-col items-start gap-1">
                  {name}
                  <ProviderStatus info={info} />
                </span>
              </span>
            }
          >
            <div className="px-6 pb-6 pt-2">
              <CurseforgeKey info={info} onChange={onChange} />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function Providers() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const providers = useQuery({ queryKey: ['admin', 'providers'], queryFn: api.providers })
  const checking = useIsFetching({ queryKey: ['admin', 'providers'] }) > 0
  const setData = (list: ProviderInfo[]) => {
    client.setQueryData(['admin', 'providers'], list)
    void client.invalidateQueries({ queryKey: statusKey('curseforge') })
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('admin.providers.title')}</CardTitle>
          <CardDescription>{t('admin.providers.hint')}</CardDescription>
        </div>
        <Tooltip content={t('admin.providers.recheck')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('admin.providers.recheck')} onClick={() => void client.invalidateQueries({ queryKey: ['admin', 'providers'] })} disabled={checking}>
            {checking ? <Spinner /> : <RiRefreshLine />}
          </Button>
        </Tooltip>
      </CardHeader>
      <div className="flex flex-col px-2 pb-3">
        {providers.isPending
          ? [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
            ))
          : providers.data?.map((p) => <ProviderRow key={p.id} info={p} onChange={setData} />)}
      </div>
    </Card>
  )
}

const TABS = ['invites', 'users', 'providers'] as const
type Tab = (typeof TABS)[number]
const TAB_ICONS = { invites: RiTicket2Fill, users: RiGroupFill, providers: RiPlugFill } satisfies Record<Tab, unknown>

export function AdminPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'invites'
  return (
    <Page>
      <PageHeader title={t('admin.title')} />
      <Segmented
        value={tab}
        onChange={(v) => setParams(v === 'invites' ? {} : { tab: v }, { replace: true })}
        options={TABS.map((v) => {
          const Icon = TAB_ICONS[v]
          return { value: v, label: t(`admin.tabs.${v}`), icon: <Icon /> }
        })}
        className="mb-6"
      />
      <div key={tab} className="animate-fade">
        {tab === 'invites' ? <Invites /> : null}
        {tab === 'users' ? <Users /> : null}
        {tab === 'providers' ? <Providers /> : null}
      </div>
    </Page>
  )
}
