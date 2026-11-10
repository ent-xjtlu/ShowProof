import type { CompanyProfile, Discovery, Exhibition } from '../domain'

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

const DISCOVERY_STATUS: Record<Discovery['status'], string> = {
  running: '检索中',
  completed: '已完成',
  partial: '部分完成',
  failed: '未完成',
}

export function WorkspaceRail({ profile, exhibitions, discoveries, active, onBoard, onProfile, onNewDiscovery, onOpenDiscovery, discovering }: Props) {
  const watched = exhibitions.filter((item) => item.watched).length
  const queued = exhibitions.filter((item) => item.status === 'queued' || item.status === 'failed').length
  return (
    <aside className="rail rail--workspace">
      <div className="rail__company">
        <p className="eyebrow mono">当前企业</p>
        <h2 className="rail__company-name">{profile.name}</h2>
        <p className="rail__company-meta">{[profile.industry, profile.cost.originCity].filter(Boolean).join(' · ') || '—'}</p>
        <button type="button" className="btn btn--primary rail__cta" onClick={onNewDiscovery} disabled={discovering}>
          {discovering ? '检索进行中…' : '开始找展会'}
          <span aria-hidden>↗</span>
        </button>
      </div>

      <nav className="railnav" aria-label="工作区导航">
        <button type="button" className="railnav__item" data-active={active === 'board' || undefined} onClick={onBoard}>
          <span className="railnav__label">展会清单</span>
          <span className="railnav__count mono">{exhibitions.length}</span>
        </button>
        <button type="button" className="railnav__item" data-active={active === 'profile' || undefined} onClick={onProfile}>
          <span className="railnav__label">企业画像</span>
          <span className="railnav__count mono">编辑</span>
        </button>
      </nav>

      <div className="rail__stats">
        <div className="rail__stat"><span className="mono">已关注</span><b>{watched}</b></div>
        <div className="rail__stat"><span className="mono">待调查</span><b>{queued}</b></div>
        <div className="rail__stat"><span className="mono">可识别企业</span><b>{exhibitions.reduce((sum, item) => sum + item.counts.total, 0)}</b></div>
      </div>

      <div className="rail__recent">
        <p className="rail__section-label mono">最近检索</p>
        {discoveries.length === 0 ? (
          <p className="rail__empty">还没有检索任务。</p>
        ) : (
          <ul className="recent">
            {discoveries.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button type="button" className="recent__item" data-status={item.status} onClick={() => onOpenDiscovery(item.id)}>
                  <span className="recent__stage">{item.stage}</span>
                  <span className="recent__meta mono">{DISCOVERY_STATUS[item.status]} · {item.updatedAt.slice(5, 10)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="rail__foot">
        <span className="rail__foot-mark" aria-hidden />
        数据保存在本机；模型密钥只存在于本机服务端
      </footer>
    </aside>
  )
}
