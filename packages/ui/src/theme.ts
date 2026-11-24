import { THEME_PRESETS as BASE_PRESETS } from '@anivire/kata-ui'

export const THEME_PRESETS = [{ id: 'hako', name: 'Hako', light: ['#f8f1e7', '#d2a676'], dark: ['#15100a', '#a6784a'] }, ...BASE_PRESETS] as const

export type ThemePreset = (typeof THEME_PRESETS)[number]['id']

export const DEFAULT_THEME: ThemePreset = 'hako'
