import { Card, Segmented } from '@hako/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWidthSlider } from '../components/appearance-panel'
import { NavPositionSettings, NavigationSettings } from '../components/layout-settings'
import { Page, PageHeader } from '../components/app-shell'
import { Flag, LANGUAGES, useChangeLanguage, useLocale } from '../components/language'
import { SchemePicker, ThemePicker } from '../components/theme-picker'

function Block({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const changeLanguage = useChangeLanguage()
  return (
    <Page>
      <PageHeader title={t('nav.settings')} />
      <div className="flex flex-col gap-10">
        <Block title={t('nav.language')}>
          <Segmented value={locale} onChange={changeLanguage} options={LANGUAGES.map((l) => ({ ...l, icon: <Flag locale={l.value} /> }))} />
        </Block>
        <Block title={t('appearance.layout')} className="hidden md:block">
          <Card className="py-1">
            <div className="flex flex-col gap-3 px-5 py-4">
              <span>
                <span className="block text-sm">{t('appearance.pageWidth')}</span>
                <span className="block text-[0.8125rem] text-muted-foreground">{t('appearance.pageWidthHint')}</span>
              </span>
              <PageWidthSlider />
            </div>
          </Card>
        </Block>
        <Block title={t('appearance.navPosition.title')} className="hidden md:block">
          <NavPositionSettings />
        </Block>
        <Block title={t('appearance.navigation')} description={t('appearance.navigationHint')}>
          <NavigationSettings />
        </Block>
        <Block title={t('appearance.scheme')}>
          <SchemePicker />
        </Block>
        <Block title={t('appearance.theme')}>
          <ThemePicker />
        </Block>
      </div>
    </Page>
  )
}
