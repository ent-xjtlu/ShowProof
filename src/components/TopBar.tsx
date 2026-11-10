import { useI18n } from '../i18n'

type Mode = 'exhibition' | 'chat'

interface Props {
  status: 'idle' | 'working' | 'error'
  companyName?: string
  mode: Mode
  onModeChange: (mode: Mode) => void
  onOpenSettings: () => void
  onOpenHelp: () => void
  onOpenFiles: () => void
  onLogout: () => void
}

export function TopBar({ status, companyName, mode, onModeChange, onOpenSettings, onOpenHelp, onOpenFiles, onLogout }: Props) {
  const { t, toggleLocale } = useI18n()
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden />
        <span className="brand__text">
          <span className="brand__name">拾证</span>
          <span className="brand__sub">{t('brand.subtitle')}</span>
        </span>
      </div>

      <span className="topbar__rule" aria-hidden />

      <div className="modeswitch" role="tablist" aria-label={t('mode.aria')}>
        <button type="button" role="tab" aria-selected={mode === 'exhibition'} data-active={mode === 'exhibition' || undefined} onClick={() => onModeChange('exhibition')}>{t('mode.exhibition')}</button>
        <button type="button" role="tab" aria-selected={mode === 'chat'} data-active={mode === 'chat' || undefined} onClick={() => onModeChange('chat')}>{t('mode.chat')}</button>
      </div>

      <div className="case">
        <span className="case__label">{t('company.label')}</span>
        <span className="case__name">{companyName || t('company.unnamed')}</span>
      </div>

      <div className="topbar__right">
        <span className="status" data-status={status}>
          <span className="status__dot" aria-hidden />
          {t(`status.${status}`)}
        </span>
        <button type="button" className="topbar__detail" onClick={onOpenFiles}>{t('nav.files')}</button>
        <button type="button" className="topbar__detail" onClick={onOpenHelp}>{t('nav.help')}</button>
        <button type="button" className="topbar__detail" onClick={onOpenSettings}>{t('nav.settings')}</button>
        <button type="button" className="topbar__detail" onClick={toggleLocale}>{t('locale.switch')}</button>
        <button type="button" className="topbar__detail" onClick={onLogout}>{t('nav.logout')}</button>
      </div>
    </header>
  )
}
