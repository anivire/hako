import { RiErrorWarningFill } from '@remixicon/react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'

export function DockerWarning() {
  const { t } = useTranslation()
  const system = useQuery({ queryKey: ['system'], queryFn: api.system, staleTime: 30_000 })
  if (system.data?.docker !== false) return null
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm">
      <RiErrorWarningFill className="mt-0.5 size-4 shrink-0 text-warning" />
      <div>
        <div className="font-medium text-warning">{t('system.dockerTitle')}</div>
        <div className="text-muted-foreground">{t('system.dockerHint')}</div>
      </div>
    </div>
  )
}
