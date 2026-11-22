import { RiAddCircleFill, RiServerFill } from '@remixicon/react'

export const NAV = [
  { key: 'servers', to: '/', end: true, icon: RiServerFill },
  { key: 'newServer', to: '/servers/new', end: true, icon: RiAddCircleFill },
] as const

export type NavKey = (typeof NAV)[number]['key']
