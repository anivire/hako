import { RiDeleteBin6Fill, RiFileCopyFill, RiTicket2Fill } from '@remixicon/react'
import type { Invite, Permission } from '@hako/shared'
import { Badge, Button, Field, Input, Select, Skeleton, StatusDot, Tooltip, toast } from '@hako/ui'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function inviteLink(code: string) {
  return `${location.origin}/invite/${code}`
}

export function copyInvite(code: string, message: string) {
  void navigator.clipboard?.writeText(inviteLink(code)).then(() => toast.success(message))
}

function inviteState(invite: Invite): 'used' | 'expired' | 'active' {
  if (invite.expiresAt && Date.parse(invite.expiresAt) < Date.now()) return 'expired'
  if (invite.usedAt && !invite.multiUse) return 'used'
  return 'active'
}

export interface InviteDraft {
  note: string
  days: string
  uses: string
}

export const EMPTY_DRAFT: InviteDraft = { note: '', days: '7', uses: 'single' }

export function draftInput(draft: InviteDraft) {
  return { note: draft.note.trim() || null, days: draft.days === 'never' ? null : Number(draft.days), multiUse: draft.uses === 'unlimited' }
}

export function InviteFields({ draft, onChange }: { draft: InviteDraft; onChange: (draft: InviteDraft) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <Field label={t('admin.note')}>
        <Input value={draft.note} onChange={(e) => onChange({ ...draft, note: e.target.value })} placeholder={t('admin.notePlaceholder')} maxLength={120} />
      </Field>
      <Field label={t('admin.expires')}>
        <Select
          value={draft.days}
          onValueChange={(days) => onChange({ ...draft, days })}
          options={[
            { value: '1', label: t('admin.days', { count: 1 }) },
            { value: '7', label: t('admin.days', { count: 7 }) },
            { value: '30', label: t('admin.days', { count: 30 }) },
            { value: 'never', label: t('admin.never') },
          ]}
        />
      </Field>
      <Field label={t('admin.uses')}>
        <Select
          value={draft.uses}
          onValueChange={(uses) => onChange({ ...draft, uses })}
          options={[
            { value: 'single', label: t('admin.usesSingle') },
            { value: 'unlimited', label: t('admin.usesUnlimited') },
          ]}
        />
      </Field>
    </>
  )
}

export function InviteList({ invites, loading, onDelete, extra }: { invites: Invite[] | undefined; loading: boolean; onDelete: (id: number) => void; extra?: (invite: Invite) => ReactNode }) {
  const { t, i18n } = useTranslation()
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })
  if (!invites?.length) {
    return loading ? (
      <Skeleton className="h-14" />
    ) : (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
        <RiTicket2Fill className="size-5 text-subtle-foreground" />
        {t('admin.noInvites')}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {invites.map((invite) => {
        const state = inviteState(invite)
        const tone = state === 'active' ? 'success' : state === 'used' ? 'neutral' : 'danger'
        const details: ReactNode[] = [
          invite.note,
          extra?.(invite),
          invite.multiUse ? t('admin.joinedCount', { count: invite.uses }) + (invite.joined.length ? `: ${invite.joined.join(', ')}` : '') : null,
          t('admin.createdOn', { date: date.format(new Date(invite.createdAt)) }),
          invite.expiresAt ? t('admin.validUntil', { date: date.format(new Date(invite.expiresAt)) }) : t('admin.noExpiry'),
        ].filter(Boolean)
        return (
          <div key={invite.id} className="flex items-start gap-3 rounded-lg bg-foreground/[0.04] px-4 py-3 sm:items-center">
            <span className="flex h-5 shrink-0 items-center">
              <StatusDot tone={tone} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[0.8125rem]">{inviteLink(invite.code)}</div>
              <div className="text-xs text-muted-foreground">
                {details.map((item, i) => (
                  <Fragment key={i}>
                    {i ? ' · ' : null}
                    {item}
                  </Fragment>
                ))}
              </div>
            </div>
            <Badge size="sm" variant={tone} className="hidden shrink-0 sm:inline-flex">
              {state === 'used' ? t('admin.usedBy', { user: invite.usedBy ?? '?' }) : state === 'active' && invite.multiUse ? t('admin.multiUse') : t(`admin.state.${state}`)}
            </Badge>
            {state === 'active' ? (
              <Tooltip content={t('admin.copy')}>
                <Button size="icon-sm" variant="ghost" aria-label={t('admin.copy')} onClick={() => copyInvite(invite.code, t('admin.copied'))}>
                  <RiFileCopyFill />
                </Button>
              </Tooltip>
            ) : null}
            <Tooltip content={t('common.delete')}>
              <Button size="icon-sm" variant="ghost" aria-label={t('common.delete')} onClick={() => onDelete(invite.id)}>
                <RiDeleteBin6Fill />
              </Button>
            </Tooltip>
          </div>
        )
      })}
    </div>
  )
}

export function PermissionChips({ permissions }: { permissions: Permission[] }) {
  const { t } = useTranslation()
  if (!permissions.length) return <span>{t('access.viewOnly')}</span>
  return <span>{permissions.map((p) => t(`access.permissions.${p}`)).join(', ')}</span>
}
