import { useEffect, useState } from 'react'
import { TopBar } from './components/TopBar'
import { LeftRail } from './components/LeftRail'
import { Workbench } from './components/Workbench'
import { DetailPanel } from './components/DetailPanel'
import { LoginScreen } from './components/LoginScreen'
import { SettingsPanel } from './components/SettingsPanel'
import { useHarnessSession } from './hooks/useHarnessSession'

type User = { id: string; email: string; name: string }

export default function App() {
  const session = useHarnessSession()
  const [railOpen, setRailOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [setupRequired, setSetupRequired] = useState(false)
  const detailOpen = session.detailOpen

  useEffect(() => {
    let cancelled = false
    const loadSetupState = async () => {
      try {
        const response = await fetch('/api/auth/setup')
        const payload = await response.json()
        if (!cancelled) setSetupRequired(Boolean(payload.required))
      } catch {
        if (!cancelled) setSetupRequired(false)
      }
    }
    const hydrateSession = async () => {
      const token = localStorage.getItem('domel_token')
      if (!token) {
        await loadSetupState()
        if (!cancelled) setUser(null)
        return
      }
      try {
        const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        if (!response.ok) throw new Error('unauthenticated')
        const payload = await response.json()
        if (!cancelled) setUser(payload.user)
      } catch {
        localStorage.removeItem('domel_token')
        await loadSetupState()
        if (!cancelled) setUser(null)
      }
    }
    void hydrateSession()
    return () => { cancelled = true }
  }, [session.loadHistory])

  useEffect(() => {
    if (user) void session.loadHistory()
  }, [user, session.loadHistory])

  const logout = async () => {
    const token = localStorage.getItem('domel_token')
    try {
      if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } finally {
      localStorage.removeItem('domel_token')
      session.reset()
      setUser(null)
    }
  }

  if (user === undefined) {
    return <div className="auth-loading"><span className="waiting__bars" aria-hidden><i /><i /><i /></span>正在连接工作台…</div>
  }
  if (!user) return <LoginScreen setupRequired={setupRequired} onLogin={setUser} />

  return (
    <div
      className="app"
      data-detail={detailOpen ? 'open' : 'closed'}
      data-rail={railOpen ? 'open' : 'closed'}
    >
      <TopBar
        status={session.status}
        detailOpen={detailOpen}
        onToggleDetail={session.toggleDetail}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen((value) => !value)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={() => void logout()}
      />

      <div className="app__body">
        {railOpen && (
          <button
            type="button"
            className="rail__scrim"
            aria-label="关闭输入栏"
            onClick={() => setRailOpen(false)}
          />
        )}
        <LeftRail
          turns={session.turns}
          activeTurn={session.activeTurn}
          onSubmit={(text) => {
            session.send(text)
            setRailOpen(false)
          }}
          onJump={session.jump}
        />

        <Workbench
          items={session.items}
          status={session.status}
          dispatch={session.dispatch}
          onInspect={session.inspect}
          onRetry={session.retry}
        />

        <DetailPanel detail={session.detail} open={detailOpen} onClose={session.closeDetail} />
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
