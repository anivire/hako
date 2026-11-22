import {
  RiBarChartBoxFill,
  RiCodeSSlashFill,
  RiCompass3Fill,
  RiCopperCoinFill,
  RiEarthFill,
  RiEqualizerFill,
  RiFileShield2Fill,
  RiGamepadFill,
  RiGlobalFill,
  RiLandscapeFill,
  RiListCheck3,
  RiLockFill,
  RiMapFill,
  RiPaletteFill,
  RiPriceTag3Fill,
  RiSave3Fill,
  RiServerFill,
  RiSettings3Fill,
  RiShieldFill,
  RiSkull2Fill,
  RiSpeedUpFill,
  RiTeamFill,
  RiTerminalBoxFill,
  RiTestTubeFill,
  RiTreeFill,
} from '@remixicon/react'
import type { ComponentType } from 'react'

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  access: RiLockFill,
  advanced: RiCodeSSlashFill,
  difficulty: RiBarChartBoxFill,
  enemies: RiSkull2Fill,
  evolution: RiTestTubeFill,
  expansion: RiCompass3Fill,
  gameplay: RiGamepadFill,
  general: RiSettings3Fill,
  journey: RiCompass3Fill,
  license: RiFileShield2Fill,
  listing: RiListCheck3,
  map: RiMapFill,
  modifiers: RiEqualizerFill,
  network: RiGlobalFill,
  performance: RiSpeedUpFill,
  players: RiTeamFill,
  pollution: RiTreeFill,
  resources: RiCopperCoinFill,
  saves: RiSave3Fill,
  server: RiServerFill,
  startup: RiTerminalBoxFill,
  terrain: RiLandscapeFill,
  version: RiPriceTag3Fill,
  world: RiEarthFill,
  appearance: RiPaletteFill,
  moderation: RiShieldFill,
}

export function GroupIcon({ id }: { id: string }) {
  const Icon = ICONS[id] ?? RiSettings3Fill
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
      <Icon className="size-4" />
    </span>
  )
}
