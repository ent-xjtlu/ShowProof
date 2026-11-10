import { useState } from 'react'
import type { ExhibitorRole, Exhibition } from '../domain'
import { ROLE_LABELS, VERDICT_LABELS } from '../domain'

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
  onVerify: (exhibitorId: string) => void
  onExport: (kind: 'md' | 'pdf' | 'csv') => void
}

export function ExhibitionDetail({ exhibition, busy, onBack, onResearch, onRefresh, onWatch, onVerify, onExport }: Props) {
  const [role, setRole] = useState<ExhibitorRole | 'all'>('all')
  const [qccOpen, setQccOpen] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const exhibitors = role === 'all' ? exhibition.exhibitors : exhibition.exhibitors.filter((item) => item.role === role)
  const dateRange = exhibition.startDate
    ? `${exhibition.startDate}${exhibition.endDate && exhibition.endDate !== exhibition.startDate ? ` – ${exhibition.endDate}` : ''}`
    : '待确认'

  const exportAs = async (kind: 'md' | 'pdf' | 'csv') => {
    setExporting(kind)
    try { onExport(kind) } finally { setExporting(null) }
  }

  return (
    <section className="panel detailx">
      <header className="detailx__head">
        <button type="button" className="back" onClick={onBack}><span aria-hidden>←</span> 返回展会清单</button>
        <div className="detailx__titlebar">
          <div>
            <p className="eyebrow mono">EXHIBITION REPORT · 展会详情</p>
            <h1 className="panel__title">{exhibition.name}</h1>
            <p className="panel__lede mono">
              {dateRange} · {[exhibition.city, exhibition.country].filter(Boolean).join('，') || '地点待确认'}
              {exhibition.venue ? ` · ${exhibition.venue}` : ''}
            </p>
          </div>
          <div className="detailx__verdict" data-verdict={exhibition.status === 'ready' ? exhibition.verdict : 'pending'}>
            <span className="detailx__verdict-label">{exhibition.status === 'ready' ? VERDICT_LABELS[exhibition.verdict] : exhibition.status === 'researching' ? '调查中' : exhibition.status === 'failed' ? '调查失败' : '尚未调查'}</span>
            <span className="detailx__score mono">{exhibition.status === 'ready' ? `综合评分 ${exhibition.score}/100` : '调查参展企业后给出结论'}</span>
          </div>
        </div>
        <div className="detailx__actions">
          <button type="button" className="btn btn--primary" onClick={onResearch} disabled={busy}>
            {busy ? '调查中…' : exhibition.status === 'ready' ? '重新调查' : '调查参展企业'}
            <span aria-hidden>↗</span>
          </button>
          {exhibition.status === 'ready' && (
            <button type="button" className="btn btn--ghost" onClick={onRefresh} disabled={busy}>
              复检更新
            </button>
          )}
          <button type="button" className="btn btn--ghost" aria-pressed={exhibition.watched} onClick={() => onWatch(!exhibition.watched)}>
            {exhibition.watched ? '★ 已关注' : '☆ 关注'}
          </button>
          <span className="detailx__actions-rule" aria-hidden />
          <button type="button" className="btn btn--ghost" onClick={() => void exportAs('md')} disabled={exporting !== null}>{exporting === 'md' ? '导出中…' : '导出 MD'}</button>
          <button type="button" className="btn btn--ghost" onClick={() => void exportAs('pdf')} disabled={exporting !== null}>{exporting === 'pdf' ? '导出中…' : '导出 PDF'}</button>
          <button type="button" className="btn btn--ghost" onClick={() => void exportAs('csv')} disabled={exporting !== null || !exhibition.exhibitors.length}>{exporting === 'csv' ? '导出中…' : '导出企业 CSV'}</button>
        </div>
      </header>

      {exhibition.status === 'researching' && (
        <p className="notice">正在读取参展商名录并核对企业，进度会自动刷新。完成后可继续复检。</p>
      )}
      {exhibition.status === 'failed' && exhibition.error && (
        <p className="notice notice--error">调查失败：{exhibition.error}。可点「调查参展企业」重试。</p>
      )}
      {exhibition.status === 'queued' && (
        <p className="notice">这个展会还没有调查参展企业。点「调查参展企业」后会读取官网名录并逐家判断关系。</p>
      )}

      <div className="detailx__grid">
        <section className="block">
          <h2 className="block__title mono">01 · 基本情况</h2>
          <dl className="kv">
            {exhibition.type && <div><dt>展会类型</dt><dd>{exhibition.type}</dd></div>}
            <div><dt>展期</dt><dd>{dateRange}</dd></div>
            <div><dt>城市 / 国家</dt><dd>{[exhibition.city, exhibition.country].filter(Boolean).join('，') || '待确认'}</dd></div>
            {exhibition.venue && <div><dt>展馆</dt><dd>{exhibition.venue}</dd></div>}
            {exhibition.organizer && <div><dt>主办方</dt><dd>{exhibition.organizer}</dd></div>}
            {exhibition.theme && <div><dt>主题</dt><dd>{exhibition.theme}</dd></div>}
            {exhibition.exhibitScope && <div><dt>展品范围</dt><dd>{exhibition.exhibitScope}</dd></div>}
            {exhibition.participation && <div><dt>参展方式</dt><dd>{exhibition.participation}</dd></div>}
            <div><dt>报名截止</dt><dd>{exhibition.registrationDeadline || '未公开'}</dd></div>
            <div><dt>官网</dt><dd>{exhibition.website ? <a href={exhibition.website} target="_blank" rel="noreferrer">{sourceHost(exhibition.website)} ↗</a> : '未提供'}</dd></div>
            <div><dt>最近调查</dt><dd className="mono">{exhibition.lastCheckedAt ? exhibition.lastCheckedAt.slice(0, 16).replace('T', ' ') : '尚未调查'}</dd></div>
          </dl>
        </section>

        <section className="block">
          <h2 className="block__title mono">02 · 参展判断</h2>
          <p className="detailx__reason">{exhibition.verdictReason || '调查参展企业后给出判断。'}</p>
          <div className="counts">
            <span><b>{exhibition.counts.total}</b>可识别企业</span>
            <span><b>{exhibition.counts.customer}</b>潜在客户</span>
            <span><b>{exhibition.counts.partner}</b>合作伙伴</span>
            <span><b>{exhibition.counts.channel}</b>渠道商</span>
            <span><b>{exhibition.counts.supplier}</b>供应商</span>
            <span><b>{exhibition.counts.competitor}</b>竞争对手</span>
          </div>
          {exhibition.fitReasons.length > 0 && (
            <>
              <h3 className="block__sub">匹配点</h3>
              <ul className="ticks">{exhibition.fitReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </>
          )}
          {exhibition.mismatchReasons.length > 0 && (
            <>
              <h3 className="block__sub">需要留意</h3>
              <ul className="ticks ticks--warn">{exhibition.mismatchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </>
          )}
        </section>

        <section className="block block--wide">
          <h2 className="block__title mono">03 · 预计费用</h2>
          <p className="block__note">按 {exhibition.cost.assumptions[0] || '企业画像参数'} 估算；区间为行业参考，不是主办方报价。</p>
          <table className="table table--cost">
            <thead><tr><th>费用项</th><th className="num">下限</th><th className="num">上限</th><th>说明</th></tr></thead>
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
                <td>参展合计</td>
                <td className="num">{money(exhibition.cost.totalMin)}</td>
                <td className="num">{money(exhibition.cost.totalMax)}</td>
                <td className="muted">含展位、运输与现场投入</td>
              </tr>
            </tbody>
          </table>
          <div className="modes">
            <div className="mode"><span className="mono">只去观展</span><b>{money(exhibition.cost.modes.visit.min)} – {money(exhibition.cost.modes.visit.max)}</b></div>
            <div className="mode"><span className="mono">只拜访重点企业</span><b>{money(exhibition.cost.modes.contact.min)} – {money(exhibition.cost.modes.contact.max)}</b></div>
            <div className="mode"><span className="mono">参展</span><b>{money(exhibition.cost.modes.booth.min)} – {money(exhibition.cost.modes.booth.max)}</b></div>
          </div>
          {exhibition.cost.assumptions.length > 1 && (
            <ul className="notes">{exhibition.cost.assumptions.slice(1).map((line) => <li key={line}>{line}</li>)}</ul>
          )}
          {exhibition.publicFees.length > 0 && (
            <div className="fees">
              <h3 className="block__sub">公开报价线索</h3>
              <ul className="notes">
                {exhibition.publicFees.map((fee, index) => (
                  <li key={`${fee.label}-${index}`}>
                    {fee.label}：{fee.amount !== undefined ? `${fee.amount}${fee.currency ? ` ${fee.currency}` : ''}${fee.unit ? `/${fee.unit.replace(/^\//, '')}` : ''}` : '金额未公开'}
                    {fee.note ? `（${fee.note}）` : ''}
                    {fee.sourceUrl && <> · <a href={fee.sourceUrl} target="_blank" rel="noreferrer">来源</a></>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="block block--wide">
          <h2 className="block__title mono">04 · 参展企业（{exhibition.counts.total}）</h2>
          <div className="chips">
            <button type="button" className="chip" data-active={role === 'all' || undefined} onClick={() => setRole('all')}>全部</button>
            {ROLE_ORDER.map((key) => (
              <button key={key} type="button" className="chip" data-active={role === key || undefined} onClick={() => setRole(key)}>
                {ROLE_LABELS[key]}<span className="chip__count mono">{exhibition.counts[key]}</span>
              </button>
            ))}
          </div>
          {exhibitors.length === 0 ? (
            <p className="board__empty-inline">暂无企业。{exhibition.status !== 'ready' ? '先调查参展企业。' : '本次调查没有取得可核实的名单。'}</p>
          ) : (
            <table className="table table--exhibitors">
              <thead><tr><th>企业</th><th>关系</th><th>判断理由</th><th className="num">置信度</th><th>补充</th></tr></thead>
              <tbody>
                {exhibitors.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="exhibitor__name">{item.name}</div>
                      {item.website && <a className="exhibitor__site mono" href={item.website} target="_blank" rel="noreferrer">{sourceHost(item.website)} ↗</a>}
                    </td>
                    <td><span className="role" data-role={item.role}>{ROLE_LABELS[item.role]}</span>{item.roleNote && <span className="role__note mono">{item.roleNote}</span>}</td>
                    <td className="exhibitor__reason">{item.reason || '—'}</td>
                    <td className="num mono">{Math.round(item.confidence * 100)}%</td>
                    <td>
                      <div className="exhibitor__extra">
                        {item.country && <span className="muted">{item.country}</span>}
                        {item.booth && <span className="muted mono">{item.booth}</span>}
                        <button type="button" className="linkbtn" onClick={() => { onVerify(item.id); setQccOpen(item.id) }}>
                          {item.qcc ? '再次核验' : '企查查核验'}
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
          <h2 className="block__title mono">05 · 建议接触与行动清单</h2>
          {exhibition.exhibitors.filter((item) => item.role === 'customer' || item.role === 'partner').slice(0, 10).length > 0 && (
            <ul className="ticks">
              {exhibition.exhibitors.filter((item) => item.role === 'customer' || item.role === 'partner').slice(0, 10).map((item) => (
                <li key={item.id}><b>{item.name}</b>：{item.reason || '建议提前预约'}</li>
              ))}
            </ul>
          )}
          {exhibition.actionPlan.length > 0 ? (
            <ol className="actions">{exhibition.actionPlan.map((item) => <li key={item}>{item}</li>)}</ol>
          ) : (
            <p className="muted">调查完成后生成行动清单。</p>
          )}
        </section>

        <section className="block">
          <h2 className="block__title mono">06 · 变化记录与来源</h2>
          {exhibition.changes.length > 0 ? (
            <ul className="changes">
              {[...exhibition.changes].reverse().slice(0, 6).map((change, index) => (
                <li key={`${change.at}-${index}`}><span className="mono">{change.at.slice(0, 10)}</span>{change.detail}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">还没有复检记录。关注后可定期复检展期、报名截止与企业名单变化。</p>
          )}
          <h3 className="block__sub">信息来源（{exhibition.sources.length}）</h3>
          {exhibition.sources.length ? (
            <ul className="sources">
              {exhibition.sources.map((source) => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                  <span className="mono">{sourceHost(source.url)} · {source.status === 'verified' ? '已核验' : '待核验'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">暂无来源记录。</p>}
        </section>
      </div>
    </section>
  )
}
