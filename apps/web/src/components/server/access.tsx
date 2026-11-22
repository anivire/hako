import { RiAddFill, RiDeleteBin6Fill, RiSearchLine, RiUserAddFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type Member, PERMISSIONS, type Permission, type Server } from '@hako/shared'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Switch, Tooltip, cn, toast } from '@hako/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ask } from '../../lib/confirm'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/queries'
import { useDebounced } from '../../lib/use-debounced'
import { EMPTY_DRAFT, InviteFields, InviteList, PermissionChips, copyInvite, draftInput } from '../invite-list'

const DEFAULT_PERMISSIONS: Permission[] = ['console', 'power']

function PermissionPicker({ value, onChange, disabled }: { value: Permission[]; onChange: (next: Permission[]) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      {PERMISSIONS.map((p) => (
        <label key={p} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted', disabled && 'cursor-default opacity-60')}>
          <span className="min-w-0">
            <span className="block text-sm">{t(`access.permissions.${p}`)}</span>
            <span className="block text-xs text-muted-foreground">{t(`access.hints.${p}`)}</span>
          </span>
          <Switch checked={value.includes(p)} disabled={disabled} onCheckedChange={(on) => onChange(on ? [...value, p] : value.filter((x) => x !== p))} />
        </label>
      ))}
    </div>
  )
}

function MemberRow({ server, member, onChange }: { server: Server; member: Member; onChange: (list: Member[]) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const save = useMutation({ mutationFn: (permissions: Permission[]) => api.setMember(server.id, member.userId, permissions), onSuccess: onChange, onError: (e) => toast.error(errorMessage(e, t)) })
  const remove = useMutation({ mutationFn: () => api.removeMember(server.id, member.userId), onSuccess: onChange, onError: (e) => toast.error(errorMessage(e, t)) })
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold uppercase text-accent">
          {member.username.slice(0, 1)}
        </span>
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="block truncate text-sm font-medium">{member.username}</span>
          <span className="block truncate text-xs text-muted-foreground">
            <PermissionChips permissions={member.permissions} />
          </span>
        </button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
          {open ? t('common.close') : t('access.edit')}
        </Button>
        <Tooltip content={t('access.remove')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('access.remove')} loading={remove.isPending} onClick={() => void ask({ title: t('access.confirmRemove', { name: member.username }), confirm: t('access.remove'), danger: true }).then((ok) => ok && remove.mutate())}>
            <RiDeleteBin6Fill />
          </Button>
        </Tooltip>
      </div>
      {open ? (
        <div className="px-4 pb-4">
          <PermissionPicker value={member.permissions} onChange={(next) => save.mutate(next)} disabled={save.isPending} />
        </div>
      ) : null}
    </div>
  )
}

function AddMember({ server, members, onChange }: { server: Server; members: Member[]; onChange: (list: Member[]) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [permissions, setPermissions] = useState<Permission[]>(DEFAULT_PERMISSIONS)
  const q = useDebounced(query.trim())
  const found = useQuery({ queryKey: ['user-search', q], queryFn: () => api.findUsers(q), enabled: q.length > 0 })
  const add = useMutation({
    mutationFn: (userId: number) => api.setMember(server.id, userId, permissions),
    onSuccess: (list) => {
      onChange(list)
      setQuery('')
      toast.success(t('access.added'))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const taken = new Set([server.ownerId, ...members.map((m) => m.userId)])
  const candidates = (found.data ?? []).filter((u) => !taken.has(u.id))
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <RiSearchLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('access.searchUser')} className="pl-9" />
      </div>
      {q ? (
        <div className="flex flex-col gap-1">
          {found.isPending ? (
            <Skeleton className="h-10" />
          ) : candidates.length ? (
            candidates.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg bg-foreground/[0.04] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.username}</span>
                <Button size="sm" variant="accent" loading={add.isPending && add.variables === u.id} onClick={() => add.mutate(u.id)}>
                  <RiUserAddFill />
                  {t('access.add')}
                </Button>
              </div>
            ))
          ) : (
            <p className="px-1 text-sm text-muted-foreground">{t('access.noUsers')}</p>
          )}
        </div>
      ) : null}
      <div>
        <div className="mb-1 px-2 text-[0.8125rem] font-medium">{t('access.newPermissions')}</div>
        <PermissionPicker value={permissions} onChange={setPermissions} />
      </div>
    </div>
  )
}

function ServerInvites({ server }: { server: Server }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const key = ['server-invites', server.id]
  const invites = useQuery({ queryKey: key, queryFn: () => api.serverInvites(server.id) })
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [permissions, setPermissions] = useState<Permission[]>(DEFAULT_PERMISSIONS)
  const create = useMutation({
    mutationFn: () => api.createServerInvite(server.id, { permissions, ...draftInput(draft) }),
    onSuccess: ({ code, invites: list }) => {
      client.setQueryData(key, list)
      setDraft(EMPTY_DRAFT)
      copyInvite(code, t('admin.createdCopied'))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const remove = useMutation({ mutationFn: (id: number) => api.deleteServerInvite(server.id, id), onSuccess: (list) => client.setQueryData(key, list) })
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <InviteFields draft={draft} onChange={setDraft} />
      </div>
      <div>
        <div className="mb-1 px-2 text-[0.8125rem] font-medium">{t('access.invitePermissions')}</div>
        <PermissionPicker value={permissions} onChange={setPermissions} />
      </div>
      <Button variant="accent" className="self-start" loading={create.isPending} onClick={() => create.mutate()}>
        <RiAddFill />
        {t('admin.createInvite')}
      </Button>
      <InviteList invites={invites.data} loading={invites.isPending} onDelete={(id) => remove.mutate(id)} extra={(invite) => <PermissionChips permissions={invite.permissions ?? []} />} />
    </div>
  )
}

export function ServerAccess({ server }: { server: Server }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const key = ['members', server.id]
  const members = useQuery({ queryKey: key, queryFn: () => api.members(server.id) })
  const setData = (list: Member[]) => client.setQueryData(key, list)
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t('access.members')}</CardTitle>
            <CardDescription>{t('access.membersHint')}</CardDescription>
          </div>
        </CardHeader>
        <div className="flex flex-col pb-2">
          {members.isPending ? (
            <div className="px-5 py-3">
              <Skeleton className="h-9" />
            </div>
          ) : members.data?.length ? (
            members.data.map((m) => <MemberRow key={m.userId} server={server} member={m} onChange={setData} />)
          ) : (
            <p className="px-5 py-4 text-sm text-muted-foreground">{t('access.noMembers')}</p>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t('access.addTitle')}</CardTitle>
            <CardDescription>{t('access.addHint')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <AddMember server={server} members={members.data ?? []} onChange={setData} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t('access.invitesTitle')}</CardTitle>
            <CardDescription>{t('access.invitesHint')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ServerInvites server={server} />
        </CardContent>
      </Card>
    </div>
  )
}
