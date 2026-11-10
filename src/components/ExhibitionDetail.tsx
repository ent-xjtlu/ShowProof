import { useState } from 'react'
import type { ExhibitorRole, Exhibition } from '../domain'
import { useI18n } from '../i18n'

const money = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`

const ROLE_ORDER: ExhibitorRole[] = ['customer', 'partner', 'channel', 'supplier', 'competitor', 'irrelevant']

function sourceHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

interface Props {
  exhibition: Exhibition
  busy: boolean
  onBack: () => void
  onResearch: () => void
  onRefresh: () => void
  onWatch: (watched: boolean) => void
  onStatusChange: (status: Exhibition['status']) => void
  onVerify: (exhibitorId: string) => void
  onExport: (kind: 'md' | 'pdf' | 'csv') => void
}

export function ExhibitionDetail({ exhibition, busy, onBack, onResearch, onRefresh, onWatch, onStatusChange, onVerify, onExport }: Props) {
  const { t } = useI18n()
  const [role, setRole] = useState<ExhibitorRole | 'all'>('all')
  const [qccOpen, setQccOpen] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const exhibitors = role === 'all' ? exhibition.exhibitors : exhibition.exhibitors.filter((item) => item.role === role)
  const dateRange = exhibition.startDate
    ? `${exhibition.startDate}${exhibition.endDate && exhibition.endDate !== exhibition.startDate ? ` – ${exhibition.endDate}` : ''}`
    : t('detail.datePending')

  const exportAs = async (kind: 'md' | 'pdf' | 'csv') => {
    setExporting(kind)
    try { onExport(kind) } finally { setExporting(null) }
  }

  return (
    <section className="panel detailx">
      <header className="detailx__head">
        <button type="button" className="back" onClick={onBack}><span aria-hidden>←</span> {t('detail.back')}</button>
        <div className="detailx__titlebar">
          <div>
            <p className="eyebrow mono">{t('detail.eyebrow')}</p>
            <h1 className="panel__title">{exhibition.name}</h1>
            <p className="panel__lede mono">
              {dateRange} · {[exhibition.city, exhibition.country].filter(Boolean).join('，') || t('detail.locationPending')}
              {exhibition.venue ? ` · ${exhibition.venue}` : ''}
            </p>
          </div>
          <div className="detailx__verdict" data-verdict={exhibition.status === 'ready' ? exhibition.verdict : 'pending'}>
            <span className="detailx__verdict-label">{exhibition.status === 'ready' ? t(`verdict.${exhibition.verdict}`) : exhibition.status === 'researching' ? t('detail.researching') : exhibition.status === 'failed' ? t('detail.researchFailed') : t('detail.notResearched')}</span>
            <span className="detailx__score mono">{exhibition.status === 'ready' ? t('detail.score', { score: exhibition.score }) : t('detail.scorePending')}</span>
          </div>
        </div>
        <div className="detailx__actions">
          <button type="button" className="btn btn--primary" onClick={onResearch} disabled={busy}>
            {busy ? t('board.researching') : exhibition.status === 'ready' ? t('detail.researchAgain') : t('detail.research')}
            <span aria-hidden>↗</span>
          </button>
          {exhibition.status === 'ready' && (
            <button type="button" className="btn btn--ghost" onClick={onRefresh} disabled={busy}>
              {t('detail.refresh')}
            </button>
          )}
          <button type="button" className="btn btn--ghost" aria-pressed={exhibition.watched} onClick={() => onWatch(!exhibition.watched)}>
            {exhibition.watched ? t('board.watchedMark') : t('board.watchMark')}
          </button>
          <label className="detailx__status mono">
            <span>{t('detail.status')}</span>
            <select value={exhibition.status} onChange={(event) => onStatusChange(event.target.value as Exhibition['status'])}>
              <option value="queued">{t('status.queued')}</option>
              <option value="researching">{t('status.researching')}</option>
              <option value="ready">{t('status.ready')}</option>
              <option value="failed">{t('status.failed')}</option>
            </select>
          </label>
          <span className="detailx__actions-rule" aria-hidden />
          <button type="button" className="btn btn--ghost" onClick={() => void exportAs('md')} disabled={exporting !== null}>{exporting === 'md' ? t('detail.exporting') : t('detail.exportMd')}</button>
          <button type="button" className="btn btn--ghost" onClick={() => void exportAs('pdf')} disabled={exporting !== null}>{exporting === 'pdf' ? t('detail.exporting') : t('detail.exportPdf')}</button>
          <button type="button" className="btn btn--ghost" onClick={() => void exportAs('csv')} disabled={exporting !== null || !exhibition.exhibitors.length}>{exporting === 'csv' ? t('detail.exporting') : t('detail.exportCsv')}</button>
        </div>
      </header>

      {exhibition.status === 'researching' && (
        <p className="notice">{t('detail.researchingNotice')}</p>
      )}
      {exhibition.status === 'failed' && exhibition.error && (
        <p className="notice notice--error">调查失败：{exhibition.error}。可点「调查参展企业」重试。</p>
      )}
      {exhibition.status === 'queued' && (
        <p className="notice">{t('detail.queuedNotice')}</p>
      )}

      <div className="detailx__grid">
        <section className="block">
          <h2 className="block__title mono">{t('detail.basic')}</h2>
          <dl className="kv">
            {exhibition.type && <div><dt>{t('detail.type')}</dt><dd>{exhibition.type}</dd></div>}
            <div><dt>{t('detail.date')}</dt><dd>{dateRange}</dd></div>
            <div><dt>{t('detail.cityCountry')}</dt><dd>{[exhibition.city, exhibition.country].filter(Boolean).join('，') || t('detail.locationPending')}</dd></div>
            {exhibition.venue && <div><dt>{t('detail.venue')}</dt><dd>{exhibition.venue}</dd></div>}
            {exhibition.organizer && <div><dt>{t('detail.organizer')}</dt><dd>{exhibition.organizer}</dd></div>}
            {exhibition.theme && <div><dt>{t('detail.theme')}</dt><dd>{exhibition.theme}</dd></div>}
            {exhibition.exhibitScope && <div><dt>{t('detail.scope')}</dt><dd>{exhibition.exhibitScope}</dd></div>}
            {exhibition.participation && <div><dt>{t('detail.participation')}</dt><dd>{exhibition.participation}</dd></div>}
            <div><dt>{t('detail.deadline')}</dt><dd>{exhibition.registrationDeadline || t('detail.unpublished')}</dd></div>
            <div><dt>{t('profile.website')}</dt><dd>{exhibition.website ? <a href={exhibition.website} target="_blank" rel="noreferrer">{sourceHost(exhibition.website)} ↗</a> : t('detail.notProvided')}</dd></div>
            <div><dt>{t('detail.lastResearch')}</dt><dd className="mono">{exhibition.lastCheckedAt ? exhibition.lastCheckedAt.slice(0, 16).replace('T', ' ') : t('detail.notResearched')}</dd></div>
          </dl>
        </section>

        <section className="block">
          <h2 className="block__title mono">{t('detail.judgment')}</h2>
          <p className="detailx__reason">{exhibition.verdictReason || t('detail.reasonPending')}</p>
          <div className="counts">
            <span><b>{exhibition.counts.total}</b>{t('detail.identifiable')}</span>
            <span><b>{exhibition.counts.customer}</b>{t('role.customer')}</span>
            <span><b>{exhibition.counts.partner}</b>{t('role.partner')}</span>
            <span><b>{exhibition.counts.channel}</b>{t('role.channel')}</span>
            <span><b>{exhibition.counts.supplier}</b>{t('role.supplier')}</span>
            <span><b>{exhibition.counts.competitor}</b>{t('role.competitor')}</span>
          </div>
          {exhibition.fitReasons.length > 0 && (
            <>
              <h3 className="block__sub">{t('detail.match')}</h3>
              <ul className="ticks">{exhibition.fitReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </>
          )}
          {exhibition.mismatchReasons.length > 0 && (
            <>
              <h3 className="block__sub">{t('detail.watchOut')}</h3>
              <ul className="ticks ticks--warn">{exhibition.mismatchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </>
          )}
        </section>

        <section className="block block--wide">
          <h2 className="block__title mono">{t('detail.cost')}</h2>
          <p className="block__note">{t('detail.costNote', { assumption: exhibition.cost.assumptions[0] || t('profile.titleExisting') })}</p>
          <table className="table table--cost">
            <thead><tr><th>{t('detail.feeItem')}</th><th className="num">{t('detail.lower')}</th><th className="num">{t('detail.upper')}</th><th>{t('detail.description')}</th></tr></thead>
            <tbody>
              {exhibition.cost.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.label}</td>
                  <td className="num">{money(item.min)}</td>
                  <td className="num">{money(item.max)}</td>
                  <td className="muted">{item.note}</td>
                </tr>
              ))}
              <tr className="table__total">
                <td>{t('detail.total')}</td>
                <td className="num">{money(exhibition.cost.totalMin)}</td>
                <td className="num">{money(exhibition.cost.totalMax)}</td>
                <td className="muted">{t('detail.totalNote')}</td>
              </tr>
            </tbody>
          </table>
          <div className="modes">
            <div className="mode"><span className="mono">{t('detail.visitOnly')}</span><b>{money(exhibition.cost.modes.visit.min)} – {money(exhibition.cost.modes.visit.max)}</b></div>
            <div className="mode"><span className="mono">{t('detail.contactOnly')}</span><b>{money(exhibition.cost.modes.contact.min)} – {money(exhibition.cost.modes.contact.max)}</b></div>
            <div className="mode"><span className="mono">{t('detail.exhibit')}</span><b>{money(exhibition.cost.modes.booth.min)} – {money(exhibition.cost.modes.booth.max)}</b></div>
          </div>
          {exhibition.cost.assumptions.length > 1 && (
            <ul className="notes">{exhibition.cost.assumptions.slice(1).map((line) => <li key={line}>{line}</li>)}</ul>
          )}
          {exhibition.publicFees.length > 0 && (
            <div className="fees">
              <h3 className="block__sub">{t('detail.publicFees')}</h3>
              <ul className="notes">
                {exhibition.publicFees.map((fee, index) => (
                  <li key={`${fee.label}-${index}`}>
                    {fee.label}：{fee.amount !== undefined ? `${fee.amount}${fee.currency ? ` ${fee.currency}` : ''}${fee.unit ? `/${fee.unit.replace(/^\//, '')}` : ''}` : t('detail.amountPrivate')}
                    {fee.note ? `（${fee.note}）` : ''}
                    {fee.sourceUrl && <> · <a href={fee.sourceUrl} target="_blank" rel="noreferrer">{t('detail.source')}</a></>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="block block--wide">
          <h2 className="block__title mono">{t('detail.exhibitors')}（{exhibition.counts.total}）</h2>
          <div className="chips">
            <button type="button" className="chip" data-active={role === 'all' || undefined} onClick={() => setRole('all')}>{t('detail.all')}</button>
            {ROLE_ORDER.map((key) => (
              <button key={key} type="button" className="chip" data-active={role === key || undefined} onClick={() => setRole(key)}>
                {t(`role.${key}`)}<span className="chip__count mono">{exhibition.counts[key]}</span>
              </button>
            ))}
          </div>
          {exhibitors.length === 0 ? (
            <p className="board__empty-inline">{t('detail.noExhibitors')}{exhibition.status !== 'ready' ? t('detail.researchFirst') : t('detail.noVerifiedList')}</p>
          ) : (
            <table className="table table--exhibitors">
              <thead><tr><th>{t('detail.exhibitor')}</th><th>{t('detail.relationship')}</th><th>{t('detail.reason')}</th><th className="num">{t('detail.confidence')}</th><th>{t('detail.extra')}</th></tr></thead>
              <tbody>
                {exhibitors.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="exhibitor__name">{item.name}</div>
                      {item.website && <a className="exhibitor__site mono" href={item.website} target="_blank" rel="noreferrer">{sourceHost(item.website)} ↗</a>}
                    </td>
                    <td><span className="role" data-role={item.role}>{t(`role.${item.role}`)}</span>{item.roleNote && <span className="role__note mono">{item.roleNote}</span>}</td>
                    <td className="exhibitor__reason">{item.reason || '—'}</td>
                    <td className="num mono">{Math.round(item.confidence * 100)}%</td>
                    <td>
                      <div className="exhibitor__extra">
                        {item.country && <span className="muted">{item.country}</span>}
                        {item.booth && <span className="muted mono">{item.booth}</span>}
                        <button type="button" className="linkbtn" onClick={() => { onVerify(item.id); setQccOpen(item.id) }}>
                          {item.qcc ? t('detail.verifyAgain') : t('detail.verifyQcc')}
                        </button>
                      </div>
                      {qccOpen === item.id && item.qcc && (
                        <div className="qcc">
                          <p className="qcc__head mono">企查查 · {item.qcc.checkedAt.slice(0, 16).replace('T', ' ')}</p>
                          <p>{item.qcc.summary}</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="block">
          <h2 className="block__title mono">{t('detail.actions')}</h2>
          {exhibition.exhibitors.filter((item) => item.role === 'customer' || item.role === 'partner').slice(0, 10).length > 0 && (
            <ul className="ticks">
              {exhibition.exhibitors.filter((item) => item.role === 'customer' || item.role === 'partner').slice(0, 10).map((item) => (
                <li key={item.id}><b>{item.name}</b>：{item.reason || t('detail.bookAhead')}</li>
              ))}
            </ul>
          )}
          {exhibition.actionPlan.length > 0 ? (
            <ol className="actions">{exhibition.actionPlan.map((item) => <li key={item}>{item}</li>)}</ol>
          ) : (
            <p className="muted">{t('detail.actionsPending')}</p>
          )}
        </section>

        <section className="block">
          <h2 className="block__title mono">{t('detail.changes')}</h2>
          {exhibition.changes.length > 0 ? (
            <ul className="changes">
              {[...exhibition.changes].reverse().slice(0, 6).map((change, index) => (
                <li key={`${change.at}-${index}`}><span className="mono">{change.at.slice(0, 10)}</span>{change.detail}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('detail.noChanges')}</p>
          )}
          <h3 className="block__sub">{t('detail.sources')}（{exhibition.sources.length}）</h3>
          {exhibition.sources.length ? (
            <ul className="sources">
              {exhibition.sources.map((source) => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                  <span className="mono">{sourceHost(source.url)} · {source.status === 'verified' ? t('detail.verified') : t('detail.pending')}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('detail.noSources')}</p>}
        </section>
      </div>
    </section>
  )
}
