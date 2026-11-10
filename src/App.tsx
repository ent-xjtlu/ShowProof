import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatSession, CompanyProfile, Discovery, Exhibition } from './domain'
import { TOKEN_KEY, downloadReport, workspaceApi, type CompanyInput } from './lib/workspaceApi'
import { chatApi } from './lib/chatApi'
import { TopBar } from './components/TopBar'
import { LoginScreen } from './components/LoginScreen'
import { SettingsPanel } from './components/SettingsPanel'
import { HelpPanel } from './components/HelpPanel'
import { CompanyForm } from './components/CompanyForm'
import { ExhibitionList } from './components/ExhibitionList'
import { ExhibitionDetail } from './components/ExhibitionDetail'
import { DiscoveryProgress } from './components/DiscoveryProgress'
import { WorkspaceRail } from './components/WorkspaceRail'
import { ChatView } from './components/ChatView'
import './workspace.css'

type User = { id: string; email: string; name: string }
type View = 'board' | 'profile' | 'discovery' | 'exhibition'

function mergeExhibitions(current: Exhibition[], incoming: Exhibition[]): Exhibition[] {
  const map = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) map.set(item.id, item)
  return [...map.values()]
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [setupRequired, setSetupRequired] = useState(false)
  const [profile, setProfile] = useState<CompanyProfile | null | undefined>(undefined)
  const [discoveries, setDiscoveries] = useState<Discovery[]>([])
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([])
  const [view, setView] = useState<View>('board')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [discoveryId, setDiscoveryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [seedText, setSeedText] = useState<string | null>(null)
  const [mode, setMode] = useState<'exhibition' | 'chat'>('exhibition')
  const [chats, setChats] = useState<ChatSession[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [toastError, setToastError] = useState(false)
  const [bulkIds, setBulkIds] = useState<string[]>([])
  const [bulkTotal, setBulkTotal] = useState(0)
  const bulkAttempted = useRef<Set<string>>(new Set())
  const bulkStarting = useRef<string | null>(null)

  const notify = useCallback((message: string, isError = false) => {
    setToast(message)
    setToastError(isError)
    window.setTimeout(() => setToast(null), 6000)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setUser(null)
      setProfile(null)
      return
    }
    let cancelled = false
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('unauthenticated')
        const payload = await response.json()
        if (!cancelled) setUser(payload.user)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        if (!cancelled) {
          setUser(null)
          setProfile(null)
        }
      })
    fetch('/api/auth/setup').then((response) => response.json()).then((payload) => { if (!cancelled) setSetupRequired(Boolean(payload.required)) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const loadAll = useCallback(async () => {
    try {
      const [company, discoveryList, exhibitionList, chatList] = await Promise.all([
        workspaceApi.getCompany(),
        workspaceApi.listDiscoveries(),
        workspaceApi.listExhibitions(),
        chatApi.list(),
      ])
      setProfile(company.profile)
      setDiscoveries(discoveryList)
      setExhibitions(exhibitionList)
      setChats(chatList)
    } catch (error) {
      setProfile(null)
      notify(error instanceof Error ? error.message : '加载数据失败', true)
    }
  }, [notify])

  useEffect(() => {
    if (user) void loadAll()
  }, [user, loadAll])

  const runningKey = discoveries.filter((item) => item.status === 'running').map((item) => item.id).join(',')

  useEffect(() => {
    if (!runningKey) return
    let cancelled = false
    const tick = async () => {
      for (const id of runningKey.split(',')) {
        try {
          const { discovery, exhibitions: list } = await workspaceApi.getDiscovery(id)
          if (cancelled) return
          setDiscoveries((prev) => prev.map((item) => (item.id === id ? discovery : item)))
          if (list.length) setExhibitions((prev) => mergeExhibitions(prev, list))
        } catch {
          /* 轮询失败下一次再试 */
        }
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [runningKey])

  const selected = useMemo(() => exhibitions.find((item) => item.id === selectedId) ?? null, [exhibitions, selectedId])
  const selectedStatus = selected?.status

  useEffect(() => {
    if (!selected || selectedStatus !== 'researching') return
    let cancelled = false
    const tick = async () => {
      try {
        const { exhibition } = await workspaceApi.getExhibition(selected.id)
        if (!cancelled) setExhibitions((prev) => mergeExhibitions(prev, [exhibition]))
      } catch { /* 重试 */ }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [selected?.id, selectedStatus])

  const qccPending = Boolean(selected?.exhibitors.some((item) => item.qcc?.summary === '核验中…'))

  useEffect(() => {
    if (!selected || !qccPending) return
    let cancelled = false
    const tick = async () => {
      try {
        const { exhibition } = await workspaceApi.getExhibition(selected.id)
        if (!cancelled) setExhibitions((prev) => mergeExhibitions(prev, [exhibition]))
      } catch { /* 重试 */ }
    }
    const timer = window.setInterval(() => void tick(), 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [selected?.id, qccPending])

  useEffect(() => {
    if (view !== 'board' || discoveryId) return
    const running = discoveries.find((item) => item.status === 'running')
    if (running) { setDiscoveryId(running.id); setView('discovery') }
  }, [discoveries, view, discoveryId])

  const startDiscovery = async () => {
    try {
      setSaving(true)
      const { discovery } = await workspaceApi.createDiscovery()
      setDiscoveries((prev) => [discovery, ...prev])
      setDiscoveryId(discovery.id)
      setView('discovery')
      setSelectedId(null)
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建检索任务失败', true)
    } finally {
      setSaving(false)
    }
  }

  const saveCompany = async (input: CompanyInput, options: { start: boolean }) => {
    try {
      setSaving(true)
      const { profile: saved } = await workspaceApi.saveCompany(input)
      setProfile(saved)
      if (options.start) await startDiscovery()
      else setView('board')
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存企业画像失败', true)
    } finally {
      setSaving(false)
    }
  }

  const research = async (id: string) => {
    try {
      await workspaceApi.researchExhibition(id)
      setSelectedId(id)
      setView('exhibition')
      setExhibitions((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'researching', error: undefined } : item)))
    } catch (error) {
      notify(error instanceof Error ? error.message : '启动调查失败', true)
    }
  }

  const refresh = async (id: string) => {
    try {
      await workspaceApi.refreshExhibition(id)
      setExhibitions((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'researching' } : item)))
      notify('已开始复检；完成后会记录变化。')
    } catch (error) {
      notify(error instanceof Error ? error.message : '复检失败', true)
    }
  }

  const startBulk = () => {
    const queued = exhibitions.filter((item) => item.status === 'queued' || item.status === 'failed').map((item) => item.id)
    if (!queued.length) {
      notify('没有待调查的展会。')
      return
    }
    bulkAttempted.current = new Set()
    bulkStarting.current = null
    setBulkTotal(queued.length)
    setBulkIds(queued)
    notify(`开始逐个调查 ${queued.length} 个展会；每完成一个会自动进入下一个。`)
  }

  const stopBulk = () => {
    setBulkIds([])
    bulkStarting.current = null
  }

  const watch = async (id: string, watched: boolean) => {
    try {
      const { exhibition } = await workspaceApi.watchExhibition(id, watched)
      setExhibitions((prev) => mergeExhibitions(prev, [exhibition]))
    } catch (error) {
      notify(error instanceof Error ? error.message : '关注操作失败', true)
    }
  }

  const verify = async (exhibitionId: string, exhibitorId: string) => {
    try {
      await workspaceApi.verifyExhibitor(exhibitionId, exhibitorId)
      setExhibitions((prev) => prev.map((item) => item.id === exhibitionId
        ? { ...item, exhibitors: item.exhibitors.map((row) => (row.id === exhibitorId ? { ...row, qcc: { checkedAt: new Date().toISOString(), summary: '核验中…' } } : row)) }
        : item))
      notify('已提交企查查核验，完成后会显示在行内。')
    } catch (error) {
      notify(error instanceof Error ? error.message : '企查查核验失败', true)
    }
  }

  const cancelDiscovery = async () => {
    if (!discoveryId) return
    try {
      const { discovery } = await workspaceApi.cancelDiscovery(discoveryId)
      setDiscoveries((prev) => prev.map((item) => (item.id === discovery.id ? discovery : item)))
      await loadAll()
    } catch (error) {
      notify(error instanceof Error ? error.message : '停止任务失败', true)
    }
  }

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    try {
      if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
      setProfile(undefined)
      setExhibitions([])
      setDiscoveries([])
      setSelectedId(null)
      setDiscoveryId(null)
      setView('board')
    }
  }

  useEffect(() => {
    if (!bulkIds.length) return
    const currentId = bulkIds[0]
    const exhibition = exhibitions.find((item) => item.id === currentId)
    if (!exhibition) {
      setBulkIds((prev) => prev.slice(1))
      return
    }
    if (exhibition.status === 'ready' || (exhibition.status === 'failed' && bulkAttempted.current.has(currentId))) {
      bulkStarting.current = null
      setBulkIds((prev) => prev.slice(1))
      return
    }
    if (exhibition.status === 'researching' || bulkStarting.current === currentId) return
    if (exhibition.status === 'queued' || exhibition.status === 'failed') {
      bulkAttempted.current.add(currentId)
      bulkStarting.current = currentId
      void workspaceApi.researchExhibition(currentId)
        .then(() => {
          setExhibitions((prev) => prev.map((item) => (item.id === currentId ? { ...item, status: 'researching', error: undefined } : item)))
        })
        .catch((error) => {
          bulkStarting.current = null
          setBulkIds([])
          notify(error instanceof Error ? error.message : '批量调查中断', true)
        })
    }
  }, [bulkIds, exhibitions, notify])

  useEffect(() => {
    if (!bulkIds.length) return
    let cancelled = false
    const tick = async () => {
      try {
        const list = await workspaceApi.listExhibitions()
        if (!cancelled) setExhibitions(list)
      } catch { /* 下一轮再试 */ }
    }
    const timer = window.setInterval(() => void tick(), 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [bulkIds.length])

  // 在清单页发起的单场调查（例如复检关注展会）也要自动刷新状态。
  const researchingKey = exhibitions.filter((item) => item.status === 'researching').map((item) => item.id).join(',')

  useEffect(() => {
    if (!researchingKey || bulkIds.length) return
    let cancelled = false
    const tick = async () => {
      try {
        const list = await workspaceApi.listExhibitions()
        if (!cancelled) setExhibitions(list)
      } catch { /* 下一轮再试 */ }
    }
    const timer = window.setInterval(() => void tick(), 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [researchingKey, bulkIds.length])

  const staleWatched = useMemo(() => {
    const staleAfter = 7 * 24 * 60 * 60 * 1000
    return exhibitions.filter((item) => item.watched && (!item.lastCheckedAt || Date.now() - new Date(item.lastCheckedAt).getTime() > staleAfter))
  }, [exhibitions])

  const activeChat = useMemo(() => chats.find((item) => item.id === activeChatId) ?? null, [chats, activeChatId])
  const runningChatKey = chats.filter((item) => item.status === 'running').map((item) => item.id).join(',')
  const chatBusy = activeChat?.status === 'running'

  useEffect(() => {
    if (!runningChatKey) return
    let cancelled = false
    const tick = async () => {
      for (const id of runningChatKey.split(',')) {
        try {
          const { chat } = await chatApi.get(id)
          if (cancelled) return
          setChats((prev) => (prev.some((item) => item.id === id) ? prev.map((item) => (item.id === id ? chat : item)) : [chat, ...prev]))
        } catch { /* 下一轮重试 */ }
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [runningChatKey])

  const mergeChat = (chat: ChatSession) => {
    setChats((prev) => (prev.some((item) => item.id === chat.id) ? prev.map((item) => (item.id === chat.id ? chat : item)) : [chat, ...prev]))
  }

  const createChat = async () => {
    try {
      const { chat } = await chatApi.create()
      mergeChat(chat)
      setActiveChatId(chat.id)
      setMode('chat')
      setChatError(null)
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建对话失败', true)
    }
  }

  const sendChat = async (text: string) => {
    setChatError(null)
    try {
      let chatId = activeChat?.id
      if (!chatId) {
        const created = await chatApi.create()
        mergeChat(created.chat)
        chatId = created.chat.id
        setActiveChatId(chatId)
      }
      const { chat } = await chatApi.send(chatId, text)
      mergeChat(chat)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : '发送失败')
    }
  }

  const cancelChat = async () => {
    if (!activeChat) return
    try {
      const { chat } = await chatApi.cancel(activeChat.id)
      mergeChat(chat)
    } catch (error) {
      notify(error instanceof Error ? error.message : '停止对话失败', true)
    }
  }

  const deleteChat = async (id: string) => {
    try {
      await chatApi.remove(id)
      setChats((prev) => prev.filter((item) => item.id !== id))
      if (activeChatId === id) setActiveChatId(null)
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除对话失败', true)
    }
  }

  const exportReport = async (kind: 'md' | 'pdf' | 'csv') => {
    if (!selected) return
    try {
      await downloadReport(selected, kind)
    } catch (error) {
      notify(error instanceof Error ? error.message : '导出失败', true)
    }
  }

  if (user === undefined) {
    return <div className="auth-loading"><span className="waiting__bars" aria-hidden><i /><i /><i /></span>正在连接工作台…</div>
  }

  if (!user) {
    return <LoginScreen setupRequired={setupRequired} onLogin={setUser} />
  }

  if (profile === undefined) {
    return <div className="auth-loading"><span className="waiting__bars" aria-hidden><i /><i /><i /></span>正在载入企业画像…</div>
  }

  const activeDiscovery = discoveries.find((item) => item.id === discoveryId) ?? discoveries.find((item) => item.status === 'running') ?? null
  const working = discoveries.some((item) => item.status === 'running') || exhibitions.some((item) => item.status === 'researching')

  return (
    <div className="app">
      <TopBar
        status={toastError ? 'error' : working || chatBusy ? 'working' : 'idle'}
        companyName={profile?.name}
        mode={mode}
        onModeChange={(next) => { setMode(next); if (next === 'chat' && !chats.length) void chatApi.list().then(setChats).catch(() => undefined) }}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onLogout={() => void logout()}
      />

      {mode === 'chat' ? (
        <div className="app__body app__body--chat">
          <ChatView
            chats={chats}
            active={activeChat}
            busy={Boolean(chatBusy)}
            error={chatError}
            seed={seedText}
            onSeedUsed={() => setSeedText(null)}
            onSelect={(id) => { setActiveChatId(id); setChatError(null) }}
            onCreate={() => void createChat()}
            onSend={(text) => void sendChat(text)}
            onCancel={() => void cancelChat()}
            onDelete={(id) => void deleteChat(id)}
          />
        </div>
      ) : (
      <div className="app__body">
        {profile ? (
          <WorkspaceRail
            profile={profile}
            exhibitions={exhibitions}
            discoveries={discoveries}
            active={view === 'discovery' ? 'discovery' : view === 'profile' ? 'profile' : 'board'}
            onBoard={() => { setView('board'); setSelectedId(null) }}
            onProfile={() => { setView('profile'); setSelectedId(null) }}
            onNewDiscovery={() => void startDiscovery()}
            onOpenDiscovery={(id) => { setDiscoveryId(id); setView('discovery'); setSelectedId(null) }}
            discovering={working}
          />
        ) : null}

        <main className="ws__main">
          {profile === null && (
            <div className="onboarding">
              <CompanyForm profile={null} saving={saving} onSubmit={saveCompany} />
            </div>
          )}

          {profile && view === 'board' && (
            exhibitions.length > 0 ? (
              <ExhibitionList
                exhibitions={exhibitions}
                busyIds={new Set()}
                discovering={working}
                bulk={bulkIds.length ? { total: bulkTotal, remaining: bulkIds.length, current: exhibitions.find((item) => item.id === bulkIds[0])?.name } : null}
                staleWatched={staleWatched}
                onOpen={(id) => { setSelectedId(id); setView('exhibition') }}
                onWatch={(id, watched) => void watch(id, watched)}
                onResearch={(id) => void research(id)}
                onBulkStart={startBulk}
                onBulkStop={stopBulk}
                onRefreshStale={(id) => void refresh(id)}
                onNewDiscovery={() => void startDiscovery()}
                onEditProfile={() => setView('profile')}
              />
            ) : (
              <section className="panel empty">
                <p className="eyebrow mono">EMPTY DESK · 还没有展会</p>
                <h1 className="panel__title">从一次检索开始</h1>
                <p className="panel__lede">软件会按你的企业画像，多轮检索相关展会并调查参展企业。</p>
                <div className="empty__actions">
                  <button type="button" className="btn btn--primary" onClick={() => void startDiscovery()} disabled={working}>
                    {working ? '检索中…' : '开始找展会'}
                    <span aria-hidden>↗</span>
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setView('profile')}>调整企业画像</button>
                </div>
              </section>
            )
          )}

          {profile && view === 'profile' && (
            <CompanyForm profile={profile} saving={saving} onSubmit={saveCompany} />
          )}

          {profile && view === 'discovery' && activeDiscovery && (
            <DiscoveryProgress
              discovery={activeDiscovery}
              onCancel={() => void cancelDiscovery()}
              onBack={() => { setView('board'); setDiscoveryId(null) }}
            />
          )}

          {profile && view === 'exhibition' && selected && (
            <ExhibitionDetail
              exhibition={selected}
              busy={selected.status === 'researching'}
              onBack={() => { setView('board'); setSelectedId(null) }}
              onResearch={() => void research(selected.id)}
              onRefresh={() => void refresh(selected.id)}
              onWatch={(watched) => void watch(selected.id, watched)}
              onVerify={(exhibitorId) => void verify(selected.id, exhibitorId)}
              onExport={(kind) => void exportReport(kind)}
            />
          )}

          {profile && view === 'exhibition' && !selected && (
            <section className="panel empty"><h1 className="panel__title">展会不存在</h1><button type="button" className="btn btn--ghost" onClick={() => setView('board')}>返回清单</button></section>
          )}
        </main>
      </div>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HelpPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onUse={async (text) => {
          setHelpOpen(false)
          setMode('chat')
          if (!activeChat) {
            try {
              const { chat } = await chatApi.create()
              mergeChat(chat)
              setActiveChatId(chat.id)
            } catch { /* 示例仍会填入，用户可手动新建 */ }
          }
          setSeedText(text)
          if (!chats.length) void chatApi.list().then(setChats).catch(() => undefined)
        }}
      />

      {toast && (
        <div className="toast" data-error={toastError || undefined} role="status">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="关闭提示">×</button>
        </div>
      )}
    </div>
  )
}
