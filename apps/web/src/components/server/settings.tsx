import { RiArrowGoBackFill, RiUploadFill } from '@remixicon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GameTemplate, Server } from '@hako/shared'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Input, SaveBar, StepSlider, Tooltip, toast } from '@hako/ui'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GroupIcon } from '../../lib/group-icons'
import { useNavigate } from 'react-router'
import { ApiError, api } from '../../lib/api'
import { useUnsavedGuard } from '../../lib/unsaved'
import { errorMessage, keys } from '../../lib/queries'
import { ServerAvatar } from '../game-icon'
import { MemoryPicker } from '../memory-picker'
import { StartupPreview } from '../startup-preview'
import { VariablesForm, focusVariable, groupOf, variableErrors, visibleVariables, withDefaults } from '../variables-form'
import { useText } from '../../lib/i18n'

function Section({ icon, title, description, children }: { icon?: string; title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        {icon ? <GroupIcon id={icon} /> : null}
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h3>
          {description ? <p className="text-[0.8125rem] text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </Card>
  )
}

export function cpuSteps(cores: number | null, current: number | null): number[] {
  const max = cores ?? 8
  const steps = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64].filter((n) => n < max)
  return [...[...new Set([...steps, max, ...(current ? [current] : [])])].sort((a, b) => a - b), 0]
}

export function ServerSettings({ server, game }: { server: Server; game: GameTemplate }) {
  const { t } = useTranslation()
  const text = useText()
  const startupKey = /\{\{\s*([A-Z][A-Z0-9_]*)/.exec(game.startup?.replace(/\{\{\s*SERVER_[A-Z_]+\s*\}\}/g, '') ?? '')?.[1]
  const startupVariable = game.variables.find((v) => v.key === startupKey)
  const startupGroup = startupVariable ? groupOf(game, startupVariable) : ''
  const client = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(server.name)
  const [memory, setMemory] = useState(server.memory)
  const [cpu, setCpu] = useState<number | null>(server.cpu)
  const system = useQuery({ queryKey: ['system'], queryFn: api.system, staleTime: 30_000 })
  const [variables, setVariables] = useState(server.variables)
  const [checked, setChecked] = useState(false)
  const save = useMutation({
    mutationFn: () => api.updateServer(server.id, { name, memory, cpu, variables }),
    onSuccess: (updated) => {
      client.setQueryData(keys.server(server.id), updated)
      client.invalidateQueries({ queryKey: keys.servers })
      toast.success(t('settings.saved'))
    },
  })
  const [code, rejectedKey] = save.error instanceof ApiError ? save.error.message.split(':') : []
  const fieldErrors: Record<string, string> = {
    ...(code === 'VARIABLE_INVALID' && rejectedKey ? { [rejectedKey]: t('wizard.errors.rejected') } : {}),
    ...(checked ? Object.fromEntries(Object.entries(variableErrors(game, variables)).map(([key, err]) => [key, t(`wizard.errors.${err}`)])) : {}),
  }
  const remove = useMutation({
    mutationFn: () => api.deleteServer(server.id),
    onSuccess: () => {
      client.setQueryData<Server[]>(keys.servers, (list) => list?.filter((s) => s.id !== server.id))
      client.removeQueries({ queryKey: keys.server(server.id) })
      client.invalidateQueries({ queryKey: keys.servers, exact: true })
      navigate('/', { replace: true })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const keys = Object.keys(variableErrors(game, variables))
    if (keys.length) {
      setChecked(true)
      focusVariable(keys[0]!)
      return
    }
    save.mutate()
  }
  const reset = () => {
    setName(server.name)
    setMemory(server.memory)
    setCpu(server.cpu)
    setVariables(server.variables)
  }
  const upload = async (key: string, file: File) => {
    const path = game.variables.find((v) => v.key === key)?.file?.path
    if (!path) return
    try {
      await api.upload(server.id, path, file)
      toast.success(t('settings.fileUploaded', { name: file.name }))
    } catch (e) {
      toast.error(errorMessage(e, t))
    }
  }
  const dirty = name !== server.name || memory !== server.memory || cpu !== server.cpu || JSON.stringify(withDefaults(game, variables)) !== JSON.stringify(withDefaults(game, server.variables))
  const guard = useUnsavedGuard(dirty)
  const groups = [...game.groups, { id: '', name: t('settings.other'), description: undefined }].filter((g) => visibleVariables(game, variables, undefined, g.id).length || (g.id === startupGroup && game.startup))
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
        <Section icon="server" title={t('settings.general')} description={t('settings.applyHint')}>
          <Field label={t('servers.name')} htmlFor="settings-name">
            <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required />
          </Field>
          <Field label={t('servers.memory')} hint={t('servers.memoryHint', { min: game.memory.min })} htmlFor="settings-memory">
            <MemoryPicker id="settings-memory" value={memory} min={game.memory.min} max={system.data?.memory} onChange={setMemory} />
          </Field>
          <Field label={t('settings.cpu')} hint={cpu ? t('settings.cpuHint', { count: cpu }) : t('settings.cpuNone')}>
            <StepSlider
              value={cpu ? String(cpu) : 'none'}
              onChange={(next) => setCpu(next === 'none' ? null : Number(next))}
              label={t('settings.cpu')}
              options={cpuSteps(system.data?.cpus ?? null, server.cpu).map((n) => ({ value: n ? String(n) : 'none', label: n ? String(n) : '∞' }))}
            />
          </Field>
        </Section>
        {groups.map((g) => (
          <Section key={g.id || 'other'} icon={g.id} title={text(g.name)} description={g.description ? text(g.description) : undefined}>
            <VariablesForm
              game={game}
              values={variables}
              onChange={(next) => {
                setVariables(next)
                if (save.error) save.reset()
              }}
              onFile={upload}
              group={g.id}
              existing
              saved={server.variables}
              errors={fieldErrors}
            />
            {g.id === startupGroup ? <StartupPreview game={game} values={variables} memory={memory} server={server} /> : null}
          </Section>
        ))}
        {save.error && code !== 'VARIABLE_INVALID' ? <p className="text-sm text-danger">{errorMessage(save.error, t)}</p> : null}
        {guard}
        {dirty ? (
          <SaveBar message={t('settings.unsaved')} cancelLabel={t('common.cancel')} saveLabel={t('common.save')} saving={save.isPending} onCancel={reset} />
        ) : null}
      </form>
      <div className="flex flex-col gap-4 self-start">
        <IconCard server={server} game={game} />
        {server.access.manage ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t('settings.dangerTitle')}</CardTitle>
                <CardDescription>{t('settings.deleteHint')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DeleteServer name={server.name} pending={remove.isPending} onConfirm={() => remove.mutate()} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function DeleteServer({ name, pending, onConfirm }: { name: string; pending: boolean; onConfirm: () => void }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const match = typed.trim() === name
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (match) onConfirm()
  }
  return (
    <Dialog onOpenChange={() => setTyped('')}>
      <DialogTrigger asChild>
        <Button variant="danger">{t('settings.delete')}</Button>
      </DialogTrigger>
      <DialogContent title={t('settings.deleteTitle', { name })} description={t('settings.deleteHint')}>
        <form onSubmit={submit} className="flex flex-col gap-4 px-6 pb-5 pt-2">
          <Field label={t('settings.confirmDelete', { name })}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="off" spellCheck={false} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" disabled={!match} loading={pending}>
              {t('settings.delete')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const ICON_SIZE = 128

async function resizeIcon(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE
  canvas.height = ICON_SIZE
  const ctx = canvas.getContext('2d')!
  const scale = Math.max(ICON_SIZE / bitmap.width, ICON_SIZE / bitmap.height)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h)
  bitmap.close()
  return canvas.toDataURL('image/png')
}

function IconCard({ server, game }: { server: Server; game: GameTemplate }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const update = useMutation({
    mutationFn: (icon: string | null) => api.updateServer(server.id, { icon }),
    onSuccess: (updated) => {
      client.setQueryData(keys.server(server.id), (s: Server | undefined) => (s ? { ...s, icon: updated.icon } : updated))
      client.setQueryData<Server[]>(keys.servers, (list) => list?.map((s) => (s.id === updated.id ? { ...s, icon: updated.icon } : s)))
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const pick = async (file: File) => {
    try {
      update.mutate(await resizeIcon(file))
    } catch {
      toast.error(t('settings.iconInvalid'))
    }
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('settings.icon')}</CardTitle>
          <CardDescription>{t('settings.iconHint')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <ServerAvatar game={game} values={server.variables} icon={server.icon} size={56} />
        <div className="flex items-center gap-1.5">
          <Button size="sm" loading={update.isPending && update.variables !== null} onClick={() => input.current?.click()}>
            <RiUploadFill />
            {t('settings.iconUpload')}
          </Button>
          {server.icon ? (
            <Tooltip content={t('settings.iconReset')}>
              <Button size="icon-sm" variant="ghost" aria-label={t('settings.iconReset')} loading={update.isPending && update.variables === null} onClick={() => update.mutate(null)}>
                <RiArrowGoBackFill />
              </Button>
            </Tooltip>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void pick(file)
          }}
        />
      </CardContent>
    </Card>
  )
}
