import { useMemo, useState } from 'react'
import type { Exhibition } from '../domain'
import { VERDICT_LABELS } from '../domain'
import { useI18n } from '../i18n'

const money = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`

type Filter = 'all' | 'watched' | 'queued'

interface Props {
  exhibitions: Exhibition[]
  busyIds: Set<string>
  discovering: boolean
  bulk: { total: number; remaining: number; current?: string } | null
  staleWatched: Exhibition[]
  onOpen: (id: string) => void
  onWatch: (id: string, watched: boolean) => void
  onResearch: (id: string) => void
  onBulkStart: () => void
  onBulkStop: () => void
  onRefreshStale: (id: string) => void
  onNewDiscovery: () => void
  onEditProfile: () => void
}

export function ExhibitionList({ exhibitions, busyIds, discovering, bulk, staleWatched, onOpen, onWatch, onResearch, onBulkStart, onBulkStop, onRefreshStale, onNewDiscovery, onEditProfile }: Props) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<'score' | 'cost' | 'name'>('score')

  const visible = useMemo(() => {
    const text = keyword.trim().toLowerCase()
    const list = exhibitions.filter((item) => {
      if (filter === 'watched' && !item.watched) return false
      if (filter === 'queued' && item.status !== 'queued' && item.status !== 'failed') return false
      if (!text) return true
      return [item.name, item.city, item.country, item.theme, item.exhibitScope].filter(Boolean).join(' ').toLowerCase().includes(text)
    })
    return list.sort((a, b) => {
      if (sort === 'cost') return a.cost.totalMin - b.cost.totalMin
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
      return b.score - a.score
    })
  }, [exhibitions, filter, keyword, sort])

  const counts = {
    all: exhibitions.length,
    watched: exhibitions.filter((item) => item.watched).length,
    queued: exhibitions.filter((item) => item.status === 'queued' || item.status === 'failed').length,
  }

  return (
    <section className="panel board">
      <header className="panel__head board__head">
        <div>
          <p className="eyebrow mono">{t('board.eyebrow')}</p>
          <h1 className="panel__title">{t('board.title', { count: counts.all })}</h1>
          <p className="panel__lede">{t('board.lede')}</p>
        </div>
        <div className="board__actions">
          <button type="button" className="btn btn--ghost" onClick={onEditProfile}>{t('board.profile')}</button>
          {bulk ? (
            <button type="button" className="btn btn--ghost" onClick={onBulkStop}>
              {t('board.bulkStop', { count: bulk.remaining })}
            </button>
          ) : counts.queued > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={onBulkStart}>
              {t('board.bulkStart', { count: counts.queued })}
            </button>
          ) : null}
          <button type="button" className="btn btn--primary" onClick={onNewDiscovery} disabled={discovering}>
            {discovering ? t('board.searching') : t('board.searchAgain')}
            <span aria-hidden>↗</span>
          </button>
        </div>
      </header>

      <div className="board__toolbar">
        <div className="tabs" role="tablist" aria-label={t('board.filter.aria')}>
          {([['all', t('board.all')], ['watched', t('board.watched')], ['queued', t('board.queued')]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} className="tab" data-active={filter === key || undefined} onClick={() => setFilter(key)}>
              {label}<span className="tab__count mono">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="board__tools">
          <input className="input input--compact" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t('board.searchPlaceholder')} aria-label={t('board.searchAria')} />
          <select className="input input--compact" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label={t('board.sortAria')}>
            <option value="score">{t('board.sort.score')}</option>
            <option value="cost">{t('board.sort.cost')}</option>
            <option value="name">{t('board.sort.name')}</option>
          </select>
        </div>
      </div>

      {staleWatched.length > 0 && (
        <div className="stale-banner">
          <span>{t('board.stale', { count: staleWatched.length })}：{staleWatched.slice(0, 3).map((item) => item.name).join('、')}{staleWatched.length > 3 ? ' 等' : ''}。</span>
          <button type="button" className="btn btn--ghost" onClick={() => onRefreshStale(staleWatched[0].id)}>
            {t('board.refresh', { name: staleWatched[0].name })}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="board__empty">
          <p>{t('board.empty')}</p>
          <p className="mono">{t('board.emptyHint')}</p>
        </div>
      ) : (
        <div className="cards">
          {visible.map((item) => {
            const busy = busyIds.has(item.id) || item.status === 'researching'
            const date = item.startDate ? `${item.startDate}${item.endDate && item.endDate !== item.startDate ? ` – ${item.endDate}` : ''}` : t('board.timePending')
            return (
              <article key={item.id} className="card" data-status={item.status}>
                <button type="button" className="card__main" onClick={() => onOpen(item.id)}>
                  <div className="card__top">
                    <span className="card__status mono" data-status={item.status}>{t(`status.${item.status}`)}</span>
                    {item.origin === 'agent' && <span className="card__origin mono">{t('board.agentAdded')}</span>}
                    {item.status === 'ready' ? (
                      <span className="card__verdict" data-verdict={item.verdict}>{VERDICT_LABELS[item.verdict]}</span>
                    ) : (
                      <span className="card__verdict" data-verdict="pending">{t(`status.${item.status}`)}</span>
                    )}
                  </div>
                  <h2 className="card__name">{item.name}</h2>
                  <p className="card__meta mono">{item.type ? `${item.type} · ` : ''}{date} · {[item.city, item.country].filter(Boolean).join('，') || t('board.locationPending')}</p>
                  {item.theme && <p className="card__theme">{item.theme}</p>}
                  <div className="card__stats">
                    <span><b>{item.fitScore}</b>{t('board.fitScore')}</span>
                    <span><b>{item.counts.customer}</b>潜在客户</span>
                    <span><b>{item.counts.partner + item.counts.channel}</b>{t('board.partners')}</span>
                    <span><b>{item.counts.competitor}</b>{t('board.competitors')}</span>
                  </div>
                  <div className="card__cost">
                    <span className="mono">{t('board.costEstimate')}</span>
                    <b>{money(item.cost.totalMin)} – {money(item.cost.totalMax)}</b>
                  </div>
                </button>
                <footer className="card__foot">
                  <button type="button" className="card__watch" aria-pressed={item.watched} onClick={() => onWatch(item.id, !item.watched)} title={item.watched ? t('board.cancelWatch') : t('board.watch')}>
                    {item.watched ? t('board.watchedMark') : t('board.watchMark')}
                  </button>
                  {item.status !== 'ready' && (
                    <button type="button" className="card__research" onClick={() => onResearch(item.id)} disabled={busy}>
                      {busy ? t('board.researching') : t('board.researchExhibitors')}
                    </button>
                  )}
                  {item.status === 'ready' && (
                    <span className="card__ready mono">{t('board.recorded', { count: item.counts.total })}</span>
                  )}
                </footer>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
