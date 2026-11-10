import type { CompanyProfile, Discovery, Exhibition } from '../domain'
import { useI18n } from '../i18n'

interface Props {
  profile: CompanyProfile
  exhibitions: Exhibition[]
  discoveries: Discovery[]
  active: 'board' | 'profile' | 'discovery'
  onBoard: () => void
  onProfile: () => void
  onNewDiscovery: () => void
  onOpenDiscovery: (id: string) => void
  discovering: boolean
}

export function WorkspaceRail({ profile, exhibitions, discoveries, active, onBoard, onProfile, onNewDiscovery, onOpenDiscovery, discovering }: Props) {
  const { t } = useI18n()
  const watched = exhibitions.filter((item) => item.watched).length
  const queued = exhibitions.filter((item) => item.status === 'queued' || item.status === 'failed').length
  return (
    <aside className="rail rail--workspace">
      <div className="rail__company">
        <p className="eyebrow mono">{t('workspace.currentCompany')}</p>
        <h2 className="rail__company-name">{profile.name}</h2>
        <p className="rail__company-meta">{[profile.industry, profile.cost.originCity].filter(Boolean).join(' · ') || '—'}</p>
        <button type="button" className="btn btn--primary rail__cta" onClick={onNewDiscovery} disabled={discovering}>
          {discovering ? t('workspace.searching') : t('workspace.startSearch')}
          <span aria-hidden>↗</span>
        </button>
      </div>

      <nav className="railnav" aria-label={t('workspace.navigation')}>
        <button type="button" className="railnav__item" data-active={active === 'board' || undefined} onClick={onBoard}>
          <span className="railnav__label">{t('workspace.exhibitions')}</span>
          <span className="railnav__count mono">{exhibitions.length}</span>
        </button>
        <button type="button" className="railnav__item" data-active={active === 'profile' || undefined} onClick={onProfile}>
          <span className="railnav__label">{t('workspace.profile')}</span>
          <span className="railnav__count mono">{t('workspace.edit')}</span>
        </button>
      </nav>

      <div className="rail__stats">
        <div className="rail__stat"><span className="mono">{t('workspace.watched')}</span><b>{watched}</b></div>
        <div className="rail__stat"><span className="mono">{t('workspace.queued')}</span><b>{queued}</b></div>
        <div className="rail__stat"><span className="mono">{t('workspace.identifiable')}</span><b>{exhibitions.reduce((sum, item) => sum + item.counts.total, 0)}</b></div>
      </div>

      <div className="rail__recent">
        <p className="rail__section-label mono">{t('workspace.recent')}</p>
        {discoveries.length === 0 ? (
          <p className="rail__empty">{t('workspace.noTasks')}</p>
        ) : (
          <ul className="recent">
            {discoveries.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button type="button" className="recent__item" data-status={item.status} onClick={() => onOpenDiscovery(item.id)}>
                  <span className="recent__stage">{item.stage}</span>
                  <span className="recent__meta mono">{t(`discovery.${item.status}`)} · {item.updatedAt.slice(5, 10)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="rail__foot">
        <span className="rail__foot-mark" aria-hidden />
        {t('workspace.localData')}
      </footer>
    </aside>
  )
}
