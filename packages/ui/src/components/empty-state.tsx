import { EmptyState as BaseEmptyState } from '@anivire/kata-ui'
import type { ComponentProps } from 'react'
import { Mascot } from './logo'

export function EmptyState({ icon, ...props }: ComponentProps<typeof BaseEmptyState>) {
  return <BaseEmptyState icon={icon ?? <Mascot mood="sleepy" size={56} className="opacity-80" />} {...props} />
}
