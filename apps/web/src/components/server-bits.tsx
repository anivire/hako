import type { Server, ServerStatus } from '@hako/shared'
import { Badge, StatusDot } from '@hako/ui'
import { useTranslation } from 'react-i18next'

const TONES: Record<ServerStatus, 'success' | 'warning' | 'neutral'> = {
  running: 'success',
  starting: 'warning',
  stopping: 'warning',
  offline: 'neutral',
}

export function StatusBadge({ status }: { status: ServerStatus }) {
  const { t } = useTranslation()
  const tone = TONES[status]
  return (
    <Badge variant={tone} size="md">
      <StatusDot tone={tone} pulse={status === 'starting' || status === 'stopping'} />
      {t(`status.${status}`)}
    </Badge>
  )
}

export function serverAddress(server: Server) {
  if (server.address) return server.address
  const port = server.ports[0]
  return port ? `${location.hostname}:${port.host}` : location.hostname
}
