import { RiAddFill, RiCheckFill, RiDeleteBin6Fill, RiDownload2Fill, RiEarthFill, RiUpload2Fill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Server, World, WorldsOverview } from '@hako/shared'
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, EmptyState, Input, Skeleton, Tooltip, toast } from '@hako/ui'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { ask } from '../../lib/confirm'
import { formatBytes } from '../../lib/format'
import { errorMessage, keys } from '../../lib/queries'

function WorldRow({ server, world, offline, onData }: { server: Server; world: World; offline: boolean; onData: (data: WorldsOverview) => void }) {
  const { t, i18n } = useTranslation()
  const onError = (e: Error) => toast.error(errorMessage(e, t))
  const select = useMutation({ mutationFn: () => api.selectWorld(server.id, world.name), onSuccess: (data) => (onData(data), toast.success(offline ? t('worlds.selected') : t('worlds.selectedRestart'))), onError })
  const remove = useMutation({ mutationFn: () => api.deleteWorld(server.id, world.name), onSuccess: onData, onError })
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <RiEarthFill className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{world.name}</span>
          {world.current ? (
            <Badge variant="accent" size="sm">
              <RiCheckFill />
              {t('worlds.current')}
            </Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(world.size)}
          {world.modifiedAt ? ` · ${new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(world.modifiedAt))}` : ''}
        </div>
      </div>
      {world.current ? null : (
        <Button variant="ghost" size="sm" loading={select.isPending} onClick={() => select.mutate()}>
          {t('worlds.select')}
        </Button>
      )}
      <Tooltip content={t('worlds.download')}>
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={api.worldDownloadUrl(server.id, world.name)} download aria-label={t('worlds.download')}>
            <RiDownload2Fill />
          </a>
        </Button>
      </Tooltip>
      {world.current ? null : (
        <Tooltip content={offline ? t('worlds.delete') : t('worlds.stopFirst')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('worlds.delete')} disabled={!offline} loading={remove.isPending} onClick={() => void ask({ title: t('worlds.confirmDelete', { name: world.name }), description: t('worlds.confirmDeleteHint'), confirm: t('worlds.delete'), danger: true }).then((ok) => ok && remove.mutate())}>
            <RiDeleteBin6Fill />
          </Button>
        </Tooltip>
      )}
    </div>
  )
}

export function ServerWorlds({ server }: { server: Server }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const key = keys.worlds(server.id)
  const overview = useQuery({ queryKey: key, queryFn: () => api.worlds(server.id) })
  const onData = (data: WorldsOverview) => client.setQueryData(key, data)
  const onError = (e: Error) => toast.error(errorMessage(e, t))
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const upload = useMutation({ mutationFn: (file: File) => api.uploadWorld(server.id, file), onSuccess: (data) => (onData(data), toast.success(t('worlds.uploaded'))), onError })
  const create = useMutation({ mutationFn: () => api.selectWorld(server.id, name.trim()), onSuccess: (data) => (onData(data), setName(''), toast.success(t('worlds.created'))), onError })
  const offline = server.status === 'offline'
  return (
    <Card>
      <CardHeader className="flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>{t('worlds.title')}</CardTitle>
          <CardDescription>{t('worlds.hint')}</CardDescription>
        </div>
        <input
          ref={input}
          type="file"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload.mutate(file)
          }}
        />
        <Tooltip content={offline ? t('worlds.uploadHint') : t('worlds.stopFirst')}>
          <Button disabled={!offline} loading={upload.isPending} onClick={() => input.current?.click()}>
            <RiUpload2Fill />
            {t('worlds.upload')}
          </Button>
        </Tooltip>
      </CardHeader>
      <form
        className="flex gap-2 px-4 pb-2 pt-3 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate()
        }}
      >
        <Input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder={t('worlds.newName')} className="max-w-xs" />
        <Button type="submit" disabled={!name.trim()} loading={create.isPending}>
          <RiAddFill />
          {t('worlds.create')}
        </Button>
      </form>
      <div className="flex flex-col pb-2">
        {overview.isPending ? (
          <div className="px-5 py-3">
            <Skeleton className="h-10" />
          </div>
        ) : overview.data?.worlds.length ? (
          overview.data.worlds.map((w) => <WorldRow key={w.name} server={server} world={w} offline={offline} onData={onData} />)
        ) : (
          <div className="px-5 pb-3">
            <EmptyState icon={<RiEarthFill className="size-10 text-subtle-foreground" />} title={t('worlds.empty')} description={t('worlds.emptyHint', { name: overview.data?.current ?? '' })} />
          </div>
        )}
      </div>
    </Card>
  )
}
