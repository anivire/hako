import { RiArchiveStackFill, RiDeleteBin6Fill, RiDownload2Fill, RiHistoryFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Backup, Server } from '@hako/shared'
import { Button, Card, CardDescription, CardHeader, CardTitle, EmptyState, Input, Skeleton, Tooltip, toast } from '@hako/ui'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { ask } from '../../lib/confirm'
import { formatBytes } from '../../lib/format'
import { errorMessage, keys } from '../../lib/queries'

function BackupRow({ server, backup, busy }: { server: Server; backup: Backup; busy: boolean }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const restore = useMutation({
    mutationFn: () => api.restoreBackup(server.id, backup.name),
    onSuccess: () => {
      toast.success(t('backups.restored'))
      client.invalidateQueries({ queryKey: ['files', server.id] })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const remove = useMutation({ mutationFn: () => api.deleteBackup(server.id, backup.name), onSuccess: (data) => client.setQueryData(keys.backups(server.id), data), onError: (e) => toast.error(errorMessage(e, t)) })
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.createdAt))
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <RiArchiveStackFill className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{date}</div>
        <div className="text-xs text-muted-foreground">{formatBytes(backup.size)}</div>
      </div>
      <Tooltip content={t('backups.download')}>
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={api.backupDownloadUrl(server.id, backup.name)} download aria-label={t('backups.download')}>
            <RiDownload2Fill />
          </a>
        </Button>
      </Tooltip>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || server.status !== 'offline'}
        loading={restore.isPending}
        title={server.status !== 'offline' ? t('backups.stopFirst') : undefined}
        onClick={() => void ask({ title: t('backups.confirmRestore', { date }), description: t('backups.confirmRestoreHint'), confirm: t('backups.restore'), danger: true }).then((ok) => ok && restore.mutate())}
      >
        <RiHistoryFill />
        {t('backups.restore')}
      </Button>
      <Tooltip content={t('backups.delete')}>
        <Button variant="ghost" size="icon-sm" aria-label={t('backups.delete')} loading={remove.isPending} onClick={() => void ask({ title: t('backups.confirmDelete', { date }), confirm: t('backups.delete'), danger: true }).then((ok) => ok && remove.mutate())}>
          <RiDeleteBin6Fill />
        </Button>
      </Tooltip>
    </div>
  )
}

export function ServerBackups({ server }: { server: Server }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const key = keys.backups(server.id)
  const overview = useQuery({ queryKey: key, queryFn: () => api.backups(server.id), refetchInterval: (q) => (q.state.data?.running ? 2000 : false) })
  const create = useMutation({
    mutationFn: () => api.createBackup(server.id),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const limit = useMutation({ mutationFn: (value: number) => api.setBackupLimit(server.id, value), onSuccess: (data) => client.setQueryData(key, data), onError: (e) => toast.error(errorMessage(e, t)) })
  const running = Boolean(overview.data?.running)
  return (
    <Card>
      <CardHeader className="flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>{t('backups.title')}</CardTitle>
          <CardDescription>{t('backups.hint')}</CardDescription>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t('backups.keep')}
          <Input
            key={overview.data?.limit}
            type="number"
            min={1}
            max={100}
            defaultValue={overview.data?.limit ?? 5}
            className="w-20"
            onBlur={(e) => {
              const value = Math.round(Number(e.target.value))
              if (value >= 1 && value <= 100 && value !== overview.data?.limit) limit.mutate(value)
            }}
          />
        </label>
        <Button variant="accent" loading={running || create.isPending} onClick={() => create.mutate()}>
          <RiArchiveStackFill />
          {running ? t('backups.creating') : t('backups.create')}
        </Button>
      </CardHeader>
      <div className="flex flex-col pb-2">
        {overview.isPending ? (
          <div className="px-5 py-3">
            <Skeleton className="h-10" />
          </div>
        ) : overview.data?.backups.length ? (
          overview.data.backups.map((b) => <BackupRow key={b.name} server={server} backup={b} busy={running} />)
        ) : (
          <div className="px-5 pb-3">
            <EmptyState title={t('backups.empty')} description={t('backups.emptyHint')} />
          </div>
        )}
      </div>
    </Card>
  )
}
