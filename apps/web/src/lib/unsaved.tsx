import { Button, Dialog, DialogClose, DialogContent } from '@hako/ui'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker } from 'react-router'

export function useUnsavedGuard(dirty: boolean) {
  const { t } = useTranslation()
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])
  return (
    <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
      <DialogContent title={t('common.unsavedTitle')} description={t('common.unsavedHint')}>
        <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
          <DialogClose asChild>
            <Button variant="ghost">{t('common.stay')}</Button>
          </DialogClose>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            {t('common.leave')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
