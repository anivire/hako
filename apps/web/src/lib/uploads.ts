import { useSyncExternalStore } from 'react'
import { api } from './api'

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'canceled'

export interface Upload {
  id: number
  serverId: string
  path: string
  file: File
  loaded: number
  status: UploadStatus
  error?: string
  xhr?: XMLHttpRequest
}

const CONCURRENCY = 3
let items: Upload[] = []
let nextId = 1
const subscribers = new Set<() => void>()
const finishers = new Map<number, () => void>()

function emit() {
  items = [...items]
  for (const fn of subscribers) fn()
}

function patch(id: number, change: Partial<Upload>) {
  items = items.map((u) => (u.id === id ? { ...u, ...change } : u))
  emit()
}

function pump() {
  const running = items.filter((u) => u.status === 'uploading').length
  for (const u of items.filter((x) => x.status === 'queued').slice(0, Math.max(0, CONCURRENCY - running))) start(u)
}

function start(upload: Upload) {
  const xhr = new XMLHttpRequest()
  xhr.open('POST', api.uploadUrl(upload.serverId, upload.path))
  xhr.withCredentials = true
  xhr.setRequestHeader('Content-Type', 'application/octet-stream')
  xhr.upload.onprogress = (e) => patch(upload.id, { loaded: e.loaded })
  const finish = (change: Partial<Upload>) => {
    patch(upload.id, { ...change, xhr: undefined })
    finishers.get(upload.id)?.()
    finishers.delete(upload.id)
    pump()
  }
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) return finish({ status: 'done', loaded: upload.file.size })
    let error = xhr.statusText
    try {
      error = (JSON.parse(xhr.responseText) as { error?: string }).error ?? error
    } catch {}
    finish({ status: 'error', error })
  }
  xhr.onerror = () => finish({ status: 'error', error: '' })
  xhr.onabort = () => finish({ status: 'canceled' })
  patch(upload.id, { status: 'uploading', xhr })
  xhr.send(upload.file)
}

export const uploads = {
  add(serverId: string, files: { file: File; path: string }[], onFinish: () => void) {
    for (const { file, path } of files) {
      const id = nextId++
      finishers.set(id, onFinish)
      items.push({ id, serverId, path, file, loaded: 0, status: 'queued' })
    }
    emit()
    pump()
  },
  cancel(id: number) {
    const upload = items.find((u) => u.id === id)
    if (upload?.xhr) upload.xhr.abort()
    else if (upload?.status === 'queued') {
      finishers.delete(id)
      patch(id, { status: 'canceled' })
    }
  },
  cancelAll(serverId: string) {
    for (const u of items) if (u.serverId === serverId && (u.status === 'queued' || u.status === 'uploading')) uploads.cancel(u.id)
  },
  clear(serverId: string) {
    items = items.filter((u) => u.serverId !== serverId || u.status === 'queued' || u.status === 'uploading')
    emit()
  },
}

export function useUploads(serverId: string) {
  const all = useSyncExternalStore(
    (fn) => {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
    () => items,
  )
  return all.filter((u) => u.serverId === serverId)
}

async function readEntry(entry: FileSystemEntry, prefix: string, out: { file: File; path: string }[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push({ file, path: prefix + entry.name })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (!batch.length) break
      for (const child of batch) await readEntry(child, `${prefix}${entry.name}/`, out)
    }
  }
}

export async function droppedFiles(data: DataTransfer): Promise<{ file: File; path: string }[]> {
  const entries = [...data.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return [...data.files].map((file) => ({ file, path: file.name }))
  const out: { file: File; path: string }[] = []
  for (const entry of entries) await readEntry(entry, '', out)
  return out
}
