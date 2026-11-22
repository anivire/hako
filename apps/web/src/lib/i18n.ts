import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import type { Locale, Text } from '@hako/shared'
import { readStorage, writeStorage } from './storage'

const STORAGE_KEY = 'hako:locale'

const LOADERS: Record<Locale, () => Promise<object>> = {
  ru: () => import('../locales/ru').then((m) => m.ru),
  en: () => import('../locales/en').then((m) => m.en),
}

function initialLocale(): Locale {
  const stored = readStorage(STORAGE_KEY)
  if (stored === 'ru' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

const initial = initialLocale()

export const i18nReady = LOADERS[initial]().then((messages) =>
  i18n.use(initReactI18next).init({
    resources: { [initial]: { translation: messages } },
    lng: initial,
    fallbackLng: false,
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
  }),
)

export async function setLocale(locale: Locale) {
  writeStorage(STORAGE_KEY, locale)
  document.documentElement.lang = locale
  if (!i18n.hasResourceBundle(locale, 'translation')) i18n.addResourceBundle(locale, 'translation', await LOADERS[locale]())
  await i18n.changeLanguage(locale)
}

export function useText() {
  const { i18n: instance } = useTranslation()
  const locale = instance.language as Locale
  return (text: Text | undefined) => (text === undefined ? '' : typeof text === 'string' ? text : (text[locale] ?? text.en ?? text.ru ?? ''))
}

document.documentElement.lang = initial
