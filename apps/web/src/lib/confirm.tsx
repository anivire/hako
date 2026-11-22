import { Button, Dialog, DialogClose, DialogContent } from '@hako/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Ask {
  title: string
  description?: string
  confirm: string
  danger?: boolean
}

type Pending = Ask & { resolve: (ok: boolean) => void }

let show: ((ask: Pending) => void) | null = null

export function ask(options: Ask): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ ...options, resolve }) : resolve(window.confirm(options.title))))
}

export function ConfirmHost() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<Pending | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    show = (next) => {
      setCurrent(next)
      setOpen(true)
    }
    return () => {
      show = null
    }
  }, [])
  const finish = (ok: boolean) => {
    current?.resolve(ok)
    setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      {current ? (
        <DialogContent title={current.title} description={current.description}>
          <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
            <DialogClose asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </DialogClose>
            <Button variant={current.danger ? 'danger' : 'accent'} autoFocus onClick={() => finish(true)}>
              {current.confirm}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
