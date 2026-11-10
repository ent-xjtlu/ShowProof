const STATUS_TEXT: Record<'idle' | 'working' | 'error', string> = {
  idle: '空闲',
  working: '工作中',
  error: '需要注意',
}

type Mode = 'exhibition' | 'chat'

interface Props {
  status: 'idle' | 'working' | 'error'
  companyName?: string
  mode: Mode
  onModeChange: (mode: Mode) => void
  onOpenSettings: () => void
  onLogout: () => void
}

export function TopBar({ status, companyName, mode, onModeChange, onOpenSettings, onLogout }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden />
        <span className="brand__text">
          <span className="brand__name">拾证</span>
          <span className="brand__sub">展会与企业信息助手</span>
        </span>
      </div>

      <span className="topbar__rule" aria-hidden />

      <div className="modeswitch" role="tablist" aria-label="工作模式">
        <button type="button" role="tab" aria-selected={mode === 'exhibition'} data-active={mode === 'exhibition' || undefined} onClick={() => onModeChange('exhibition')}>展会助手</button>
        <button type="button" role="tab" aria-selected={mode === 'chat'} data-active={mode === 'chat' || undefined} onClick={() => onModeChange('chat')}>对话 Agent</button>
      </div>

      <div className="case">
        <span className="case__label">企业</span>
        <span className="case__name">{companyName || '未命名企业'}</span>
      </div>

      <div className="topbar__right">
        <span className="status" data-status={status}>
          <span className="status__dot" aria-hidden />
          {STATUS_TEXT[status]}
        </span>
        <button type="button" className="topbar__detail" onClick={onOpenSettings}>连接设置</button>
        <button type="button" className="topbar__detail" onClick={onLogout}>退出</button>
      </div>
    </header>
  )
}
