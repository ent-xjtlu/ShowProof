import type { Discovery } from '../domain'
import { useI18n } from '../i18n'

interface Props {
  discovery: Discovery
  onCancel: () => void
  onBack: () => void
}

export function DiscoveryProgress({ discovery, onCancel, onBack }: Props) {
  const { t } = useI18n()
  const running = discovery.status === 'running'
  const recent = [...discovery.activity].reverse().slice(0, 30)
  return (
    <section className="panel progress">
      <header className="panel__head">
        <div>
          <p className="eyebrow mono">DISCOVERY · {t('workspace.exhibitions')}</p>
          <h1 className="panel__title">{running ? t('discovery.running') : discovery.status === 'failed' ? t('discovery.failed') : t('discovery.completed')}</h1>
          <p className="panel__lede">{discovery.stage}{discovery.error ? `：${discovery.error}` : ''}</p>
        </div>
        <div className="progress__actions">
          {!running && <button type="button" className="btn btn--ghost" onClick={onBack}>{t('detail.back')}</button>}
          {running && <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('discovery.stop')}</button>}
        </div>
      </header>

      <div className="progress__bar" data-running={running || undefined} data-status={discovery.status}>
        <span />
      </div>

      <div className="progress__stats">
        <div><b>{discovery.exhibitionIds.length}</b><span>{t('workspace.exhibitions')}</span></div>
        <div><b>{discovery.activity.length}</b><span>{t('workspace.recent')}</span></div>
        <div><b className="progress__state">{t(`discovery.${discovery.status}`)}</b><span>{t('detail.status')}</span></div>
      </div>

      <p className="progress__note">
        软件会分多轮检索并自动去重：换行业协会、场馆排期、主办方与上下游行业等角度补充，直到没有新展会为止。展会数量不设固定上限（安全上限 120 个）。
      </p>

      <ol className="tracebox">
        {recent.map((item, index) => (
          <li key={`${item.at}-${index}`} className="tracebox__item" data-status={item.status}>
            <span className="tracebox__dot" aria-hidden />
            <div>
              <p className="tracebox__label">{item.label}</p>
              {item.detail && <p className="tracebox__detail">{item.detail}</p>}
              <p className="tracebox__time mono">{item.at.slice(11, 19)}</p>
            </div>
          </li>
        ))}
        {!recent.length && <li className="muted">{t('discovery.waiting')}</li>}
      </ol>
    </section>
  )
}
