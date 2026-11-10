import type { StreamStatus } from '../types'

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle: '空闲',
  working: '检索中',
  error: '连接异常',
}

interface Props {
  status: StreamStatus
  detailOpen: boolean
  onToggleDetail: () => void
  railOpen: boolean
  onToggleRail: () => void
  onOpenSettings: () => void
  onLogout: () => void
}

export function TopBar({ status, detailOpen, onToggleDetail, railOpen, onToggleRail, onOpenSettings, onLogout }: Props) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__rail-toggle"
        onClick={onToggleRail}
        aria-expanded={railOpen}
      >
        <span aria-hidden>☰</span>
        输入
      </button>

      <div className="brand">
        <span className="brand__mark" aria-hidden />
        <span className="brand__text">
          <span className="brand__name">拾证</span>
          <span className="brand__sub">市场情报工作台</span>
        </span>
      </div>

      <span className="topbar__rule" aria-hidden />

      <div className="case">
        <span className="case__label">案例</span>
        <span className="case__name">Domel · 电机与风机</span>
      </div>

      <div className="topbar__right">
        <span className="status" data-status={status}>
          <span className="status__dot" aria-hidden />
          {STATUS_TEXT[status]}
        </span>
        <button type="button" className="topbar__detail" onClick={onOpenSettings}>
          连接设置
        </button>
        <button
          type="button"
          className="topbar__detail"
          onClick={onToggleDetail}
          aria-expanded={detailOpen}
        >
          {detailOpen ? '收起来源' : '来源面板'}
        </button>
        <button type="button" className="topbar__detail" onClick={onLogout}>
          退出
        </button>
      </div>
    </header>
  )
}
