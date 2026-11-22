import {
  RiArrowLeftFill,
  RiCheckFill,
  RiCloseFill,
  RiDeleteBinFill,
  RiDownloadFill,
  RiErrorWarningFill,
  RiFileTextFill,
  RiFolder3Fill,
  RiFolderAddFill,
  RiSave3Fill,
  RiUploadCloud2Fill,
  RiUploadFill,
} from '@remixicon/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FileEntry, Server } from '@hako/shared'
import { Badge, Button, Card, EmptyState, Input, Progress, Skeleton, Tooltip, cn, toast } from '@hako/ui'
import { type DragEvent, type FormEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ask } from '../../lib/confirm'
import { api } from '../../lib/api'
import { formatBytes, joinPath, parentPath } from '../../lib/format'
import { errorMessage, keys } from '../../lib/queries'
import { droppedFiles, uploads, useUploads } from '../../lib/uploads'
import { CodeEditor, languageOf } from '../code-editor'

const DRAG_TYPE = 'application/x-hako-path'

function FileEditor({ server, path, onClose }: { server: Server; path: string; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const file = useQuery({ queryKey: keys.file(server.id, path), queryFn: () => api.readFile(server.id, path), gcTime: 0 })
  const [draft, setDraft] = useState<string | null>(null)
  const dirty = draft !== null && draft !== file.data?.content
  const save = useMutation({
    mutationFn: (content: string) => api.writeFile(server.id, path, content),
    onSuccess: (_, content) => {
      client.setQueryData(keys.file(server.id, path), { content })
      client.invalidateQueries({ queryKey: keys.files(server.id, parentPath(path)) })
      toast.success(t('files.saved'))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const submit = () => {
    if (draft !== null && dirty && !save.isPending) save.mutate(draft)
  }
  const close = () => {
    if (!dirty) return onClose()
    void ask({ title: t('files.discard'), confirm: t('common.discardChanges'), danger: true }).then((ok) => ok && onClose())
  }
  return (
    <Card className="flex h-[calc(100dvh-15rem)] min-h-96 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <Tooltip content={t('files.back')}>
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label={t('files.back')}>
            <RiArrowLeftFill />
          </Button>
        </Tooltip>
        <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">
          <span className="text-muted-foreground">{parentPath(path) ? `${parentPath(path)}/` : ''}</span>
          {path.split('/').pop()}
          {dirty ? <span className="ml-2 inline-block size-2 rounded-full bg-warning align-middle" aria-label={t('files.unsaved')} /> : null}
        </span>
        <Badge>{languageOf(path).name}</Badge>
        <Tooltip content={t('files.download')}>
          <Button asChild variant="ghost" size="icon-sm">
            <a href={api.downloadUrl(server.id, path)} download aria-label={t('files.download')}>
              <RiDownloadFill />
            </a>
          </Button>
        </Tooltip>
        <Button size="sm" variant="accent" loading={save.isPending} disabled={!dirty} onClick={submit}>
          <RiSave3Fill />
          {t('common.save')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-2">
        {file.error ? (
          <EmptyState title={errorMessage(file.error, t)} />
        ) : file.isPending ? (
          <div className="flex flex-col gap-2.5 p-4">
            {[40, 72, 56, 64, 30, 80, 48].map((w, i) => (
              <Skeleton key={i} className="h-3.5" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <CodeEditor path={path} value={file.data.content} onChange={setDraft} onSave={submit} />
        )}
      </div>
    </Card>
  )
}

export function UploadManager({ server }: { server: Server }) {
  const { t } = useTranslation()
  const list = useUploads(server.id)
  const [collapsed, setCollapsed] = useState(false)
  if (!list.length) return null
  const active = list.filter((u) => u.status === 'queued' || u.status === 'uploading')
  const total = list.reduce((sum, u) => sum + u.file.size, 0)
  const loaded = list.reduce((sum, u) => sum + (u.status === 'done' ? u.file.size : u.loaded), 0)
  return (
    <Card className="fixed bottom-4 right-4 z-40 w-[min(calc(100vw-2rem),24rem)] overflow-hidden shadow-xl">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <RiUploadCloud2Fill className="size-5 shrink-0 text-accent" />
        <button type="button" className="min-w-0 flex-1 cursor-pointer text-left text-sm font-medium" onClick={() => setCollapsed(!collapsed)}>
          {active.length ? t('files.uploading', { count: active.length }) : t('files.uploadsDone')}
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">
            {formatBytes(loaded)} / {formatBytes(total)}
          </span>
        </button>
        {active.length ? (
          <Button size="sm" variant="ghost" onClick={() => uploads.cancelAll(server.id)}>
            {t('files.cancelAll')}
          </Button>
        ) : (
          <Tooltip content={t('common.close')}>
            <Button size="icon-sm" variant="ghost" aria-label={t('common.close')} onClick={() => uploads.clear(server.id)}>
              <RiCloseFill />
            </Button>
          </Tooltip>
        )}
      </div>
      <Progress value={total ? loaded / total : 0} className="rounded-none" />
      {collapsed ? null : (
        <ul className="max-h-64 overflow-y-auto p-1.5">
          {list.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs" title={u.path}>
                  {u.path}
                </div>
                {u.status === 'uploading' || u.status === 'queued' ? (
                  <Progress value={u.file.size ? u.loaded / u.file.size : 0} className="mt-1 h-1" />
                ) : (
                  <div className={cn('text-xs', u.status === 'error' ? 'text-danger' : 'text-muted-foreground')}>
                    {u.status === 'error' ? errorMessage(new Error(u.error), t) : u.status === 'canceled' ? t('files.canceled') : formatBytes(u.file.size)}
                  </div>
                )}
              </div>
              {u.status === 'done' ? (
                <RiCheckFill className="size-4 text-success" />
              ) : u.status === 'error' ? (
                <RiErrorWarningFill className="size-4 text-danger" />
              ) : u.status === 'canceled' ? null : (
                <Button size="icon-sm" variant="ghost" aria-label={t('common.cancel')} onClick={() => uploads.cancel(u.id)}>
                  <RiCloseFill />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function ServerFiles({ server }: { server: Server }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const dir = params.get('path') ?? ''
  const editing = params.get('file')
  const [folder, setFolder] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const depth = useRef(0)
  const upload = useRef<HTMLInputElement>(null)
  const files = useQuery({ queryKey: keys.files(server.id, dir), queryFn: () => api.files(server.id, dir), placeholderData: keepPreviousData })
  const refresh = () => client.invalidateQueries({ queryKey: ['files', server.id] })
  const navigate = (change: (next: URLSearchParams) => void) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      change(next)
      return next
    })
  const open = (path: string) =>
    navigate((next) => {
      next.delete('file')
      if (path) next.set('path', path)
      else next.delete('path')
    })
  const edit = (path: string | null) => navigate((next) => (path ? next.set('file', path) : next.delete('file')))
  const remove = useMutation({
    mutationFn: (entry: FileEntry) => api.removePath(server.id, joinPath(dir, entry.name)),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const move = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => api.movePath(server.id, from, to),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const makeDir = useMutation({
    mutationFn: (name: string) => api.makeDir(server.id, joinPath(dir, name)),
    onSuccess: () => {
      setFolder(null)
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const send = (target: string, list: { file: File; path: string }[]) => {
    if (list.length) uploads.add(server.id, list.map((x) => ({ file: x.file, path: joinPath(target, x.path) })), refresh)
  }
  const submitFolder = (e: FormEvent) => {
    e.preventDefault()
    if (folder?.trim()) makeDir.mutate(folder.trim())
  }
  const internal = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE)
  const accepts = (e: DragEvent) => internal(e) || e.dataTransfer.types.includes('Files')
  const dropInto = async (e: DragEvent, target: string) => {
    e.preventDefault()
    e.stopPropagation()
    depth.current = 0
    setDropTarget(null)
    const from = e.dataTransfer.getData(DRAG_TYPE)
    if (from) {
      const to = joinPath(target, from.split('/').pop()!)
      if (to !== from && target !== from && !target.startsWith(`${from}/`)) move.mutate({ from, to })
      return
    }
    send(target, await droppedFiles(e.dataTransfer))
  }
  const targetProps = (target: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!accepts(e) || (internal(e) && target === dir)) return setDropTarget(null)
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = internal(e) ? 'move' : 'copy'
      setDropTarget(target)
    },
    onDrop: (e: DragEvent) => void dropInto(e, target),
  })

  if (editing) return <FileEditor key={editing} server={server} path={editing} onClose={() => edit(null)} />

  const crumbs = dir ? dir.split('/') : []
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
  const dropHere = dropTarget === dir
  return (
    <div
      className="flex flex-col gap-3"
      onDragEnter={(e) => {
        if (accepts(e)) depth.current += 1
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setDropTarget(null)
      }}
      {...targetProps(dir)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" disabled={!dir} onClick={() => open(parentPath(dir))} aria-label={t('files.up')} {...(dir ? targetProps(parentPath(dir)) : {})}>
          <RiArrowLeftFill />
        </Button>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 font-mono text-[0.8125rem]">
          {['', ...crumbs.map((_, i) => crumbs.slice(0, i + 1).join('/'))].map((path, i) => (
            <span key={path} className="flex items-center gap-1">
              {i > 1 ? <span className="text-subtle-foreground">/</span> : null}
              <button
                type="button"
                className={cn(
                  'cursor-pointer break-all rounded px-1 text-muted-foreground hover:text-foreground',
                  dropTarget === path && path !== dir && 'bg-accent-soft text-accent',
                )}
                onClick={() => open(path)}
                {...targetProps(path)}
              >
                {i ? crumbs[i - 1] : '/'}
              </button>
            </span>
          ))}
        </nav>
        <Button size="sm" onClick={() => setFolder('')}>
          <RiFolderAddFill />
          {t('files.newFolder')}
        </Button>
        <Button size="sm" onClick={() => upload.current?.click()}>
          <RiUploadFill />
          {t('files.upload')}
        </Button>
        <input
          ref={upload}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const list = [...(e.target.files ?? [])]
            e.target.value = ''
            send(dir, list.map((file) => ({ file, path: file.name })))
          }}
        />
      </div>
      {folder !== null ? (
        <form onSubmit={submitFolder} className="flex gap-2">
          <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={t('files.folderName')} autoFocus />
          <Button type="submit" variant="accent" loading={makeDir.isPending}>
            {t('common.create')}
          </Button>
          <Button variant="ghost" onClick={() => setFolder(null)}>
            {t('common.cancel')}
          </Button>
        </form>
      ) : null}
      <div className="relative">
        {files.isPending ? (
          <Card className="flex flex-col gap-1 p-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-2.5 py-2">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-3.5" style={{ width: `${[38, 22, 30, 45, 26, 34, 20, 28][i]}%` }} />
                <Skeleton className="ml-auto hidden h-3 w-14 sm:block" />
                <Skeleton className="hidden h-3 w-24 md:block" />
              </div>
            ))}
          </Card>
        ) : files.error ? (
          <EmptyState title={errorMessage(files.error, t)} />
        ) : !files.data.length ? (
          <EmptyState icon={<RiUploadCloud2Fill className="size-10 text-subtle-foreground" />} title={t('files.empty')} description={dir ? t('files.dropHint') : t('files.emptyRoot')} />
        ) : (
          <Card className="overflow-hidden p-1.5">
            {files.data.map((entry) => {
              const path = joinPath(dir, entry.name)
              return (
                <div
                  key={entry.name}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, path)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => setDropTarget(null)}
                  {...(entry.dir ? targetProps(path) : {})}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-2.5 py-1.5 hover:bg-muted',
                    dropTarget === path && 'bg-accent-soft shadow-[inset_0_0_0_1px_var(--color-accent)]',
                  )}
                >
                  <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left text-sm" onClick={() => (entry.dir ? open(path) : edit(path))}>
                    {entry.dir ? <RiFolder3Fill className="size-4 shrink-0 text-accent" /> : <RiFileTextFill className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="break-all">{entry.name}</span>
                  </button>
                  <span className="hidden w-20 text-right font-mono text-xs text-subtle-foreground sm:block">{entry.dir ? '' : formatBytes(entry.size)}</span>
                  <span className="hidden w-32 text-right text-xs text-subtle-foreground md:block">{date.format(new Date(entry.modifiedAt))}</span>
                  <div className="flex gap-0.5">
                    {entry.dir ? null : (
                      <Tooltip content={t('files.download')}>
                        <Button asChild variant="ghost" size="icon-sm">
                          <a href={api.downloadUrl(server.id, path)} download aria-label={t('files.download')}>
                            <RiDownloadFill />
                          </a>
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip content={t('common.delete')}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.delete')}
                        onClick={() => {
                          void ask({ title: t('files.confirmDelete', { name: entry.name }), confirm: t('common.delete'), danger: true }).then((ok) => ok && remove.mutate(entry))
                        }}
                      >
                        <RiDeleteBinFill />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              )
            })}
          </Card>
        )}
        {dropHere ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-accent-soft/80 shadow-[inset_0_0_0_2px_var(--color-accent)] backdrop-blur-[1px]">
            <span className="flex items-center gap-2 text-sm font-medium text-accent">
              <RiUploadCloud2Fill className="size-5" />
              {t('files.dropHere', { path: `/${dir}` })}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
