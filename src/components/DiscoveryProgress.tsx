import type { Discovery } from '../domain'

interface Props {
  discovery: Discovery
  onCancel: () => void
  onBack: () => void
}

const STATUS_LABEL: Record<Discovery['status'], string> = {
  running: '检索中',
  completed: '已完成',
  partial: '部分完成',
  failed: '未完成',
}

export function DiscoveryProgress({ discovery, onCancel, onBack }: Props) {
  const running = discovery.status === 'running'
  const recent = [...discovery.activity].reverse().slice(0, 30)
  return (
    <section className="panel progress">
      <header className="panel__head">
        <div>
          <p className="eyebrow mono">DISCOVERY · 展会检索</p>
          <h1 className="panel__title">{running ? '正在检索相关展会' : discovery.status === 'failed' ? '检索未完成' : '检索完成'}</h1>
          <p className="panel__lede">{discovery.stage}{discovery.error ? `：${discovery.error}` : ''}</p>
        </div>
        <div className="progress__actions">
          {!running && <button type="button" className="btn btn--ghost" onClick={onBack}>返回展会清单</button>}
          {running && <button type="button" className="btn btn--ghost" onClick={onCancel}>停止检索</button>}
        </div>
      </header>

      <div className="progress__bar" data-running={running || undefined} data-status={discovery.status}>
        <span />
      </div>

      <div className="progress__stats">
        <div><b>{discovery.exhibitionIds.length}</b><span>候选展会</span></div>
        <div><b>{discovery.activity.length}</b><span>执行事件</span></div>
        <div><b className="progress__state">{STATUS_LABEL[discovery.status]}</b><span>当前状态</span></div>
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
        {!recent.length && <li className="muted">等待第一个检索事件…</li>}
      </ol>
    </section>
  )
}
