import { useMemo, useState } from 'react'
import type { Exhibition } from '../domain'
import { VERDICT_LABELS } from '../domain'

const money = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`

const STATUS_LABELS: Record<Exhibition['status'], string> = {
  queued: '待调查',
  researching: '调查中',
  ready: '已调查',
  failed: '调查失败',
}

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
          <p className="eyebrow mono">EXHIBITION BOARD · 展会清单</p>
          <h1 className="panel__title">找到 {counts.all} 个相关展会</h1>
          <p className="panel__lede">按匹配度排序；点开任意展会查看参展企业、费用与参展建议。</p>
        </div>
        <div className="board__actions">
          <button type="button" className="btn btn--ghost" onClick={onEditProfile}>企业画像</button>
          {bulk ? (
            <button type="button" className="btn btn--ghost" onClick={onBulkStop}>
              批量调查中 · 剩余 {bulk.remaining} · 停止
            </button>
          ) : counts.queued > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={onBulkStart}>
              调查全部待调查（{counts.queued}）
            </button>
          ) : null}
          <button type="button" className="btn btn--primary" onClick={onNewDiscovery} disabled={discovering}>
            {discovering ? '检索中…' : '再找一轮'}
            <span aria-hidden>↗</span>
          </button>
        </div>
      </header>

      <div className="board__toolbar">
        <div className="tabs" role="tablist" aria-label="展会筛选">
          {([['all', '全部'], ['watched', '已关注'], ['queued', '待调查']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} className="tab" data-active={filter === key || undefined} onClick={() => setFilter(key)}>
              {label}<span className="tab__count mono">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="board__tools">
          <input className="input input--compact" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索展会、城市、主题" aria-label="搜索展会" />
          <select className="input input--compact" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="排序">
            <option value="score">按匹配度</option>
            <option value="cost">按费用</option>
            <option value="name">按名称</option>
          </select>
        </div>
      </div>

      {staleWatched.length > 0 && (
        <div className="stale-banner">
          <span>有 {staleWatched.length} 个关注展会超过 7 天未复检：{staleWatched.slice(0, 3).map((item) => item.name).join('、')}{staleWatched.length > 3 ? ' 等' : ''}。</span>
          <button type="button" className="btn btn--ghost" onClick={() => onRefreshStale(staleWatched[0].id)}>
            复检「{staleWatched[0].name}」
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="board__empty">
          <p>还没有符合条件的展会。</p>
          <p className="mono">调整筛选条件，或点「再找一轮」补充检索。</p>
        </div>
      ) : (
        <div className="cards">
          {visible.map((item) => {
            const busy = busyIds.has(item.id) || item.status === 'researching'
            const date = item.startDate ? `${item.startDate}${item.endDate && item.endDate !== item.startDate ? ` – ${item.endDate}` : ''}` : '时间待确认'
            return (
              <article key={item.id} className="card" data-status={item.status}>
                <button type="button" className="card__main" onClick={() => onOpen(item.id)}>
                  <div className="card__top">
                    <span className="card__status mono" data-status={item.status}>{STATUS_LABELS[item.status]}</span>
                    {item.origin === 'agent' && <span className="card__origin mono">Agent 添加</span>}
                    {item.status === 'ready' ? (
                      <span className="card__verdict" data-verdict={item.verdict}>{VERDICT_LABELS[item.verdict]}</span>
                    ) : (
                      <span className="card__verdict" data-verdict="pending">{STATUS_LABELS[item.status]}</span>
                    )}
                  </div>
                  <h2 className="card__name">{item.name}</h2>
                  <p className="card__meta mono">{item.type ? `${item.type} · ` : ''}{date} · {[item.city, item.country].filter(Boolean).join('，') || '地点待确认'}</p>
                  {item.theme && <p className="card__theme">{item.theme}</p>}
                  <div className="card__stats">
                    <span><b>{item.fitScore}</b>匹配分</span>
                    <span><b>{item.counts.customer}</b>潜在客户</span>
                    <span><b>{item.counts.partner + item.counts.channel}</b>伙伴/渠道</span>
                    <span><b>{item.counts.competitor}</b>竞品</span>
                  </div>
                  <div className="card__cost">
                    <span className="mono">参展估算</span>
                    <b>{money(item.cost.totalMin)} – {money(item.cost.totalMax)}</b>
                  </div>
                </button>
                <footer className="card__foot">
                  <button type="button" className="card__watch" aria-pressed={item.watched} onClick={() => onWatch(item.id, !item.watched)} title={item.watched ? '取消关注' : '关注此展会'}>
                    {item.watched ? '★ 已关注' : '☆ 关注'}
                  </button>
                  {item.status !== 'ready' && (
                    <button type="button" className="card__research" onClick={() => onResearch(item.id)} disabled={busy}>
                      {busy ? '调查中…' : '调查参展企业'}
                    </button>
                  )}
                  {item.status === 'ready' && (
                    <span className="card__ready mono">已收录 {item.counts.total} 家企业</span>
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
